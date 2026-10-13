const { query, pool } = require('../../config/database');
const eventBus = require('../../shared/events/eventBus');
const { withTransaction } = require('../../shared/database/transaction');
const HttpError = require('../../shared/errors/httpError');

/**
 * Validates whether a staff member belongs to the same department as the request category.
 * @param {string} requestId - UUID of the service request
 * @param {string} staffUserId - UUID of the staff user
 * @returns {Promise<{ allowed: boolean, reason?: string, currentStatus?: string }>}
 */
exports.validateStaffDepartment = async (requestId, staffUserId) => {
  // Query request department and staff active assigned department
  const sql = `
    SELECT 
      r.status,
      c.department_id AS request_department_id,
      d.name AS request_department_name,
      sa.department_id AS staff_department_id
    FROM service_requests r
    JOIN request_categories c ON r.category_id = c.category_id
    JOIN departments d ON c.department_id = d.department_id
    LEFT JOIN staff_assignments sa 
      ON sa.staff_id = $2 AND sa.is_active = true AND sa.department_id = c.department_id
    WHERE r.request_id = $1
  `;
  const result = await query(sql, [requestId, staffUserId]);
  if (result.rows.length === 0) {
    return { allowed: false, reason: 'Request not found' };
  }

  const row = result.rows[0];

  // If staff has no matching active assignment in the request department:
  if (!row.staff_department_id) {
    // Check if staff has any assignment at all to give a helpful reason
    const staffDepts = await query(
      `SELECT d.name FROM staff_assignments sa 
       JOIN departments d ON sa.department_id = d.department_id 
       WHERE sa.staff_id = $1 AND sa.is_active = true`,
      [staffUserId]
    );
    const assignedNames = staffDepts.rows.map((r) => r.name).join(', ') || 'No department assigned';
    return {
      allowed: false,
      reason: `Staff member belongs to [${assignedNames}], but this request is assigned to [${row.request_department_name}].`,
      currentStatus: row.status,
    };
  }

  return { allowed: true, currentStatus: row.status };
};

/**
 * Assigns a request to a staff user, updating service_requests and inserting into request_assignment_history
 * and request_status_history if transitioning from SUBMITTED to ASSIGNED.
 *
 * @param {string} requestId
 * @param {string} staffUserId
 * @returns {Promise<object>} updated request record
 */
exports.assignToStaff = async (requestId, staffUserId) => {
  const assignment = await withTransaction(pool, async (client) => {
    // 1. Lock request row
    const reqRes = await client.query(
      'SELECT status, assigned_staff_id FROM service_requests WHERE request_id = $1 FOR UPDATE',
      [requestId]
    );
    if (reqRes.rows.length === 0) {
      throw new HttpError(404, 'Request not found.');
    }
    const currentStatus = reqRes.rows[0].status;
    const previousAssignee = reqRes.rows[0].assigned_staff_id;
    const { requestsService } = require('../requests');
    await requestsService.checkStaffAccess(requestId, staffUserId, client);
    if (reqRes.rows[0].assigned_staff_id || currentStatus !== 'SUBMITTED') {
      throw new HttpError(403, 'This request is not available for assignment.');
    }
    const now = new Date();

    // 2. Determine new status: if currently SUBMITTED, transition to ASSIGNED
    const newStatus = currentStatus === 'SUBMITTED' ? 'ASSIGNED' : currentStatus;

    // 3. Update service_requests: assigned_staff_id, assigned_at, assigned_by, status, updated_at
    await client.query(
      `UPDATE service_requests 
       SET assigned_staff_id = $1,
           assigned_at = $2::timestamptz AT TIME ZONE 'UTC',
           assigned_by = $1,
           status = $3,
           updated_at = $2::timestamptz AT TIME ZONE 'UTC'
       WHERE request_id = $4`,
      [staffUserId, now, newStatus, requestId]
    );

    // 4. Record in request_assignment_history
    await client.query(
      `INSERT INTO request_assignment_history 
        (request_id, assigned_to_staff_id, assigned_by_id, assigned_at)
       VALUES ($1, $2, $2, $3::timestamptz AT TIME ZONE 'UTC')`,
      [requestId, staffUserId, now]
    );

    // 5. If status transitioned, record in request_status_history
    if (currentStatus !== newStatus) {
      await client.query(
        `INSERT INTO request_status_history
          (request_id, old_status, new_status, changed_by, changed_at)
         VALUES ($1, $2, $3, $4, $5::timestamptz AT TIME ZONE 'UTC')`,
        [requestId, currentStatus, newStatus, staffUserId, now]
      );
    }

    return {
      result: {
        requestId,
        status: newStatus,
        assignedStaffId: staffUserId,
        assignedAt: now,
      },
      previousAssignee,
    };
  });

  // Emit audit event only after the shared transaction helper commits successfully.
  eventBus.emitAuditEvent('RequestAssigned', {
    requestId,
    assignedToStaffId: staffUserId,
    userId: staffUserId,
    previousAssignee: assignment.previousAssignee,
    timestamp: new Date(),
  });

  return assignment.result;
};
