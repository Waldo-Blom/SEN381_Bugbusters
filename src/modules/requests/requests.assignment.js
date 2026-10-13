const { query, pool } = require('../../config/database');
const contextModel = require('./requests.contact-access.model');
const { RequestAccessError } = require('./requests.access');
const { isUuid } = require('./requests.schema');
const auditModel = require('../audit/audit.model');
const { withTransaction } = require('../../shared/database/transaction');

exports.listEligible = async (requestId, managerId) => {
  const context = await require('./requests.contact-access.service').getForManager(
    requestId,
    managerId
  );
  const result = await query(
    `SELECT DISTINCT u.user_id AS id, u.first_name || ' ' || u.last_name AS name
     FROM users u JOIN staff_assignments sa ON sa.staff_id = u.user_id
     WHERE sa.department_id = $1 AND sa.is_active = true
       AND u.is_active = true AND u.user_type = 'STAFF'
     ORDER BY name, id`,
    [context.department_id]
  );
  return result.rows;
};

exports.assign = async (requestId, managerId, staffId, priority) => {
  if (![requestId, managerId, staffId].every(isUuid))
    throw new RequestAccessError('Select a valid staff member.', 400);
  if (priority !== undefined && !['Low', 'Medium', 'High', 'Urgent'].includes(priority))
    throw new RequestAccessError('Select a valid priority.', 400);
  return withTransaction(pool, async (client) => {
    const context = await contextModel.findContext(requestId, managerId, client, true);
    if (!context) throw new RequestAccessError('Request not found.', 404);
    if (!context.manager_allowed)
      throw new RequestAccessError("You do not manage this request's department.");
    const { rows } = await client.query(
      'SELECT status FROM service_requests WHERE request_id = $1',
      [requestId]
    );
    const status = rows[0].status;
    if (!['SUBMITTED', 'ASSIGNED', 'IN_PROGRESS'].includes(status))
      throw new RequestAccessError('This request is no longer eligible for assignment.', 409);
    const eligible = await client.query(
      `SELECT u.user_id FROM users u JOIN staff_assignments sa ON sa.staff_id = u.user_id
       WHERE u.user_id = $1 AND sa.department_id = $2 AND sa.is_active = true
         AND u.is_active = true AND u.user_type = 'STAFF' FOR SHARE OF u, sa`,
      [staffId, context.department_id]
    );
    if (!eligible.rows.length)
      throw new RequestAccessError('Select an active staff member from this department.', 400);
    if (context.assigned_staff_id === staffId)
      throw new RequestAccessError('This staff member is already assigned to the request.', 409);
    const newStatus = status === 'SUBMITTED' ? 'ASSIGNED' : status;
    await client.query(
      `UPDATE service_requests SET assigned_staff_id = $2, assigned_by = $3,
       assigned_at = LOCALTIMESTAMP, updated_at = LOCALTIMESTAMP, status = $4,
       priority = COALESCE($5::priority, priority), contact_information_approved = false,
       contact_approved_by = NULL, contact_approved_at = NULL WHERE request_id = $1`,
      [requestId, staffId, managerId, newStatus, priority?.toUpperCase() || null]
    );
    await client.query(
      `UPDATE request_assignment_history SET removed_at = LOCALTIMESTAMP
       WHERE request_id = $1 AND removed_at IS NULL`,
      [requestId]
    );
    await client.query(
      `INSERT INTO request_assignment_history (request_id, assigned_to_staff_id, assigned_by_id)
       VALUES ($1, $2, $3)`,
      [requestId, staffId, managerId]
    );
    if (status !== newStatus)
      await client.query(
        `INSERT INTO request_status_history (request_id, old_status, new_status, changed_by)
       VALUES ($1, $2, $3, $4)`,
        [requestId, status, newStatus, managerId]
      );
    await auditModel.recordAuditEntry(client, {
      admin_id: managerId,
      action_type: 'REQUEST_ASSIGNED',
      target_type: 'REQUEST',
      target_id: requestId,
      changed_data: { previousAssignee: context.assigned_staff_id, assignedToStaffId: staffId },
    });
  });
};
