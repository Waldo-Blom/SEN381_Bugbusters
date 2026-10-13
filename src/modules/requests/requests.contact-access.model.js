const { query, pool } = require('../../config/database');
const { RequestAccessError, requireStaffAccess } = require('./requests.access');
const eventBus = require('../../shared/events/eventBus');
const { withTransaction } = require('../../shared/database/transaction');

// Resolve ownership from PostgreSQL rather than trusting session department IDs.
exports.findContext = async (requestId, actorId, client = { query }, lock = false) => {
  const result = await client.query(
    `SELECT r.request_id, r.assigned_staff_id, r.contact_information_approved,
            c.department_id,
            EXISTS (SELECT 1 FROM users manager WHERE manager.user_id = $2
              AND manager.user_id = d.manager_id AND manager.user_type = 'MANAGER'
              AND manager.is_active = true AND d.is_active = true) AS manager_allowed,
            EXISTS (SELECT 1 FROM staff_assignments sa JOIN users staff ON staff.user_id = sa.staff_id
              WHERE sa.staff_id = $2 AND sa.department_id = c.department_id AND sa.is_active = true
                AND staff.user_type = 'STAFF' AND staff.is_active = true AND d.is_active = true) AS staff_allowed,
            EXISTS (SELECT 1 FROM staff_assignments sa JOIN users staff ON staff.user_id = sa.staff_id
              WHERE sa.staff_id = r.assigned_staff_id AND sa.department_id = c.department_id
                AND sa.is_active = true AND staff.user_type = 'STAFF' AND staff.is_active = true) AS assignee_eligible
     FROM service_requests r JOIN request_categories c ON c.category_id = r.category_id
     JOIN departments d ON d.department_id = c.department_id
     WHERE r.request_id = $1 ${lock ? 'FOR UPDATE OF r' : ''}`,
    [requestId, actorId]
  );
  return result.rows[0] || null;
};

const requireManager = (context) => {
  if (!context) throw new RequestAccessError('Request not found.', 404);
  if (!context.manager_allowed)
    throw new RequestAccessError("You do not manage this request's department.");
};

const transaction = (operation) => withTransaction(pool, operation);

const setApproval = (client, requestId, managerId, approved) =>
  client.query(
    `UPDATE service_requests SET contact_information_approved = $2,
     contact_approved_by = CASE WHEN $2::boolean THEN $3::uuid ELSE NULL END,
     contact_approved_at = CASE WHEN $2::boolean THEN LOCALTIMESTAMP ELSE NULL END
   WHERE request_id = $1`,
    [requestId, approved, managerId]
  );

/**
 * Emit a contact access event for audit logging
 * @param {string} action - Action type
 * @param {Object} params - Event parameters
 */
const emitContactAccessEvent = (action, params) => {
  eventBus.emitAuditEvent('ContactAccessAuthorized', {
    action,
    ...params,
    timestamp: new Date(),
  });
};

exports.createRequest = (requestId, staffId, reason) =>
  transaction(async (client) => {
    const context = await exports.findContext(requestId, staffId, client, true);
    requireStaffAccess(context, staffId, true);
    if (context.contact_information_approved) return { status: 'APPROVED' };
    const latest = await client.query(
      `SELECT status FROM request_contact_access_requests
     WHERE request_id = $1 AND requested_by = $2 AND department_id = $3
     ORDER BY requested_at DESC, contact_access_request_id DESC LIMIT 1`,
      [requestId, staffId, context.department_id]
    );
    if (latest.rows[0]?.status === 'PENDING') return latest.rows[0];
    if (latest.rows[0]?.status === 'REJECTED') {
      throw new RequestAccessError('Your request for contact access was denied.');
    }
    const saved = await client.query(
      `INSERT INTO request_contact_access_requests (request_id, requested_by, department_id, reason)
     VALUES ($1, $2, $3, $4) RETURNING contact_access_request_id, status`,
      [requestId, staffId, context.department_id, reason]
    );
    // Emit event for audit logging (append-only, non-blocking)
    emitContactAccessEvent('CONTACT_ACCESS_REQUESTED', {
      requestId,
      actorId: staffId,
      details: {
        contactAccessRequestId: saved.rows[0].contact_access_request_id,
        requestedBy: staffId,
        departmentId: context.department_id,
      },
    });
    return saved.rows[0];
  });

exports.reviewRequest = (accessId, managerId, approved) =>
  transaction(async (client) => {
    // Discover the request ID, then consistently lock the service request before its access row.
    const lookup = await client.query(
      'SELECT request_id FROM request_contact_access_requests WHERE contact_access_request_id = $1',
      [accessId]
    );
    if (!lookup.rows[0]) throw new RequestAccessError('Contact access request not found.', 404);
    const requestId = lookup.rows[0].request_id;
    const context = await exports.findContext(requestId, managerId, client, true);
    requireManager(context);
    const saved = await client.query(
      'SELECT * FROM request_contact_access_requests WHERE contact_access_request_id = $1 FOR UPDATE',
      [accessId]
    );
    const access = saved.rows[0];
    if (!access) throw new RequestAccessError('Contact access request not found.', 404);
    if (access.request_id !== requestId)
      throw new RequestAccessError(
        'This contact access request has changed. Please reload the page.',
        409
      );
    if (access.department_id !== context.department_id)
      throw new RequestAccessError('This contact access request belongs to another department.');
    if (access.status !== 'PENDING')
      throw new RequestAccessError('This contact access request has already been reviewed.', 409);
    if (access.requested_by !== context.assigned_staff_id || !context.assignee_eligible) {
      throw new RequestAccessError(
        'The requesting staff member is no longer assigned to this request.',
        409
      );
    }
    await client.query(
      `UPDATE request_contact_access_requests SET status = $2, reviewed_by = $3,
       reviewed_at = CURRENT_TIMESTAMP, review_note = $4 WHERE contact_access_request_id = $1`,
      [
        accessId,
        approved ? 'APPROVED' : 'REJECTED',
        managerId,
        approved ? 'Contact access approved.' : 'Contact access denied by management.',
      ]
    );
    await setApproval(client, requestId, managerId, approved);
    // Emit event for audit logging
    emitContactAccessEvent(approved ? 'CONTACT_ACCESS_APPROVED' : 'CONTACT_ACCESS_REJECTED', {
      requestId,
      actorId: managerId,
      details: {
        contactAccessRequestId: accessId,
        requestedBy: access.requested_by,
        departmentId: context.department_id,
        previousApproved: context.contact_information_approved,
        approved,
      },
    });
  });

exports.changeApproval = (requestId, managerId, approved) =>
  transaction(async (client) => {
    const context = await exports.findContext(requestId, managerId, client, true);
    requireManager(context);
    if (approved && (!context.assigned_staff_id || !context.assignee_eligible)) {
      throw new RequestAccessError(
        'Assign an active staff member from this department before authorising contact access.',
        409
      );
    }
    // Preserve rejected decisions; a direct grant overrides them through the approval flag.
    await client.query(
      `UPDATE request_contact_access_requests SET status = $3, reviewed_by = $4,
       reviewed_at = CURRENT_TIMESTAMP, review_note = $5
     WHERE request_id = $1 AND requested_by = $2 AND department_id = $6
       AND status IN ('PENDING', 'APPROVED')`,
      [
        requestId,
        context.assigned_staff_id,
        approved ? 'APPROVED' : 'CANCELLED',
        managerId,
        approved
          ? 'Contact access authorised by management.'
          : 'Contact access revoked by management.',
        context.department_id,
      ]
    );
    await setApproval(client, requestId, managerId, approved);
    // Emit event for audit logging
    emitContactAccessEvent(approved ? 'CONTACT_ACCESS_APPROVED' : 'CONTACT_ACCESS_REVOKED', {
      requestId,
      actorId: managerId,
      details: {
        requestedBy: context.assigned_staff_id,
        departmentId: context.department_id,
        previousApproved: context.contact_information_approved,
        approved,
        direct: true,
      },
    });
  });

exports.findInbox = async (managerId, departmentId) => {
  const result = await query(
    `SELECT a.contact_access_request_id AS id, r.request_id, r.request_number AS reference,
       r.title, staff.first_name || ' ' || staff.last_name AS staff_name,
       a.reason, a.requested_at, a.status,
       (a.status = 'PENDING' AND a.requested_by = r.assigned_staff_id AND staff.is_active = true
         AND staff.user_type = 'STAFF' AND EXISTS (SELECT 1 FROM staff_assignments sa
           WHERE sa.staff_id = a.requested_by AND sa.department_id = d.department_id AND sa.is_active = true)) AS can_review
     FROM request_contact_access_requests a JOIN service_requests r ON r.request_id = a.request_id
     JOIN request_categories c ON c.category_id = r.category_id
     JOIN departments d ON d.department_id = c.department_id AND d.department_id = a.department_id
     JOIN users manager ON manager.user_id = d.manager_id
     JOIN users staff ON staff.user_id = a.requested_by
     WHERE d.manager_id = $1 AND d.department_id = $2 AND d.is_active = true
       AND manager.is_active = true AND manager.user_type = 'MANAGER'
     ORDER BY (a.status = 'PENDING') DESC, a.requested_at DESC, a.contact_access_request_id DESC`,
    [managerId, departmentId]
  );
  return result.rows;
};
