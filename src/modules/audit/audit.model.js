const { query } = require('../../config/database');

exports.recordContactAccessChange = async (client, { actorId, requestId, action, details }) => {
  await client.query(
    `INSERT INTO admin_audit_log (admin_id, action_type, target_type, target_id, changed_data, created_at)
     VALUES ($1, $2::action_type, 'REQUEST', $3, $4::json, LOCALTIMESTAMP)`,
    [actorId, action, requestId, JSON.stringify(details || {})]
  );
};

exports.recordStatusChange = async (client, { actorId, requestId, oldStatus, newStatus }) => {
  await client.query(
    `INSERT INTO admin_audit_log (admin_id, action_type, target_type, target_id, changed_data, created_at)
     VALUES ($1, 'STATUS_CHANGED'::action_type, 'REQUEST', $2, $3::json, LOCALTIMESTAMP)`,
    [actorId, requestId, JSON.stringify({ oldStatus, newStatus })]
  );
};

exports.recordAssignment = async (
  client,
  { actorId, requestId, assignedToStaffId, previousAssignee }
) => {
  await client.query(
    `INSERT INTO admin_audit_log (admin_id, action_type, target_type, target_id, changed_data, created_at)
     VALUES ($1, 'REQUEST_ASSIGNED'::action_type, 'REQUEST', $2, $3::json, LOCALTIMESTAMP)`,
    [actorId, requestId, JSON.stringify({ assignedToStaffId, previousAssignee })]
  );
};

exports.recordAdminUserEvent = async (
  client,
  { actorId, actionType, targetType, targetId, changedData }
) => {
  await client.query(
    `INSERT INTO admin_audit_log (admin_id, action_type, target_type, target_id, changed_data, created_at)
     VALUES ($1, $2::action_type, $3::target_type, $4, $5::json, LOCALTIMESTAMP)`,
    [actorId, actionType, targetType, targetId, JSON.stringify(changedData || {})]
  );
};

const queryAuditLog = async ({
  requestId = null,
  managerId = null,
  departmentId = null,
  actionType = null,
  limit = 100,
  offset = 0,
} = {}) => {
  const result = await query(
    `WITH scoped_requests AS (
       SELECT r.request_id, r.request_number, r.created_at, r.created_by
       FROM service_requests r
       JOIN request_categories c ON c.category_id = r.category_id
       JOIN departments d ON d.department_id = c.department_id
       JOIN users manager ON manager.user_id = d.manager_id
       WHERE ($1::uuid IS NULL OR r.request_id = $1)
         AND ($2::uuid IS NULL OR d.manager_id = $2)
         AND ($3::uuid IS NULL OR d.department_id = $3)
         AND d.is_active = true AND manager.is_active = true
         AND manager.user_type = 'MANAGER'
     ), entries AS (
       SELECT s.request_id AS target_id, s.request_number, 'REQUEST_SUBMITTED'::text AS action_type,
              s.created_by AS actor_id, NULL::uuid AS assignee_id,
                '{}'::json AS changed_data, s.created_at, NULL::uuid AS subject_id
       FROM scoped_requests s
       UNION ALL
       SELECT h.request_id, s.request_number, 'STATUS_CHANGED',
              h.changed_by, NULL::uuid,
              json_build_object('oldStatus', h.old_status, 'newStatus', h.new_status),
                h.changed_at, NULL::uuid
       FROM request_status_history h
       JOIN scoped_requests s ON s.request_id = h.request_id
       UNION ALL
       SELECT a.request_id, s.request_number, 'REQUEST_ASSIGNED',
              a.assigned_by_id, a.assigned_to_staff_id,
              json_build_object('assignedToStaffId', a.assigned_to_staff_id),
                a.assigned_at, NULL::uuid
       FROM request_assignment_history a
       JOIN scoped_requests s ON s.request_id = a.request_id
       UNION ALL
       SELECT a.target_id, s.request_number, a.action_type::text,
                a.admin_id, NULL::uuid, a.changed_data, a.created_at, NULL::uuid
       FROM admin_audit_log a
       JOIN scoped_requests s ON s.request_id = a.target_id
       WHERE a.target_type = 'REQUEST'
         AND a.action_type NOT IN ('STATUS_CHANGED', 'REQUEST_ASSIGNED')
         UNION ALL
         SELECT a.target_id, NULL::varchar, a.action_type::text,
                a.admin_id, NULL::uuid, a.changed_data, a.created_at,
                CASE WHEN a.target_type = 'USER' THEN a.target_id
                     ELSE assignment_staff.staff_id END
         FROM admin_audit_log a
         LEFT JOIN staff_assignments assignment_staff
           ON a.target_type = 'ASSIGNMENT'
          AND assignment_staff.staff_assignment_id = a.target_id
         WHERE $1::uuid IS NULL
           AND a.target_type IN ('USER', 'ASSIGNMENT')
           AND a.action_type IN (
             'USER_CREATED', 'USER_MODIFIED', 'USER_DEACTIVATED',
             'STAFF_ASSIGNED', 'STAFF_REMOVED'
           )
           AND (
             (a.target_type = 'USER' AND EXISTS (
               SELECT 1
               FROM staff_assignments scoped_assignment
               JOIN departments d ON d.department_id = scoped_assignment.department_id
               JOIN users manager ON manager.user_id = d.manager_id
               WHERE scoped_assignment.staff_id = a.target_id
                 AND d.manager_id = $2 AND d.department_id = $3 AND d.is_active = true
                 AND manager.is_active = true AND manager.user_type = 'MANAGER'
             ))
             OR
             (a.target_type = 'ASSIGNMENT' AND EXISTS (
               SELECT 1
               FROM staff_assignments scoped_assignment
               JOIN departments d ON d.department_id = scoped_assignment.department_id
               JOIN users manager ON manager.user_id = d.manager_id
               WHERE scoped_assignment.staff_assignment_id = a.target_id
                 AND d.manager_id = $2 AND d.department_id = $3 AND d.is_active = true
                 AND manager.is_active = true AND manager.user_type = 'MANAGER'
             ))
           )
       )
       SELECT e.target_id, e.request_number, e.action_type, e.changed_data, e.created_at,
              NULLIF(concat_ws(' ', actor.first_name, actor.last_name), '') AS actor_name,
              NULLIF(concat_ws(' ', assignee.first_name, assignee.last_name), '') AS assignee_name,
              NULLIF(concat_ws(' ', subject.first_name, subject.last_name), '') AS subject_name,
              subject.email AS subject_email,
              to_char(e.created_at, 'YYYY-MM-DD HH24:MI') AS timestamp
       FROM entries e
       LEFT JOIN users actor ON actor.user_id = e.actor_id
       LEFT JOIN users assignee ON assignee.user_id = e.assignee_id
       LEFT JOIN users subject ON subject.user_id = e.subject_id
     WHERE ($4::text IS NULL OR e.action_type = $4)
     ORDER BY e.created_at DESC, e.action_type, e.target_id
     LIMIT $5 OFFSET $6`,
    [requestId, managerId, departmentId, actionType, limit, offset]
  );
  return result.rows;
};

exports.getAuditLogForRequest = (requestId) => queryAuditLog({ requestId });

exports.getAuditLog = async (filters = {}) => {
  if (!filters.managerId || !filters.departmentId) {
    throw new Error('Manager and department scope are required to read the audit log.');
  }
  return queryAuditLog(filters);
};

exports.getAuditLogCount = async ({ managerId, departmentId, actionType } = {}) => {
  if (!managerId || !departmentId) {
    throw new Error('Manager and department scope are required to count audit log entries.');
  }
  const result = await query(
    `SELECT COUNT(*)::int AS count
     FROM (
      SELECT r.request_id, 'REQUEST_SUBMITTED'::text AS action_type
      FROM service_requests r
      JOIN request_categories c ON c.category_id = r.category_id
      JOIN departments d ON d.department_id = c.department_id
      JOIN users manager ON manager.user_id = d.manager_id
      WHERE d.manager_id = $1 AND d.department_id = $2
        AND d.is_active = true AND manager.is_active = true
        AND manager.user_type = 'MANAGER'
      UNION ALL
      SELECT h.request_id, 'STATUS_CHANGED'::text AS action_type
       FROM request_status_history h
       JOIN service_requests r ON r.request_id = h.request_id
       JOIN request_categories c ON c.category_id = r.category_id
       JOIN departments d ON d.department_id = c.department_id
       JOIN users manager ON manager.user_id = d.manager_id
       WHERE d.manager_id = $1 AND d.department_id = $2
         AND d.is_active = true AND manager.is_active = true
         AND manager.user_type = 'MANAGER'
       UNION ALL
       SELECT a.request_id, 'REQUEST_ASSIGNED'
       FROM request_assignment_history a
       JOIN service_requests r ON r.request_id = a.request_id
       JOIN request_categories c ON c.category_id = r.category_id
       JOIN departments d ON d.department_id = c.department_id
       JOIN users manager ON manager.user_id = d.manager_id
       WHERE d.manager_id = $1 AND d.department_id = $2
         AND d.is_active = true AND manager.is_active = true
         AND manager.user_type = 'MANAGER'
       UNION ALL
       SELECT a.target_id, a.action_type::text
       FROM admin_audit_log a
       JOIN service_requests r ON r.request_id = a.target_id
       JOIN request_categories c ON c.category_id = r.category_id
       JOIN departments d ON d.department_id = c.department_id
       JOIN users manager ON manager.user_id = d.manager_id
       WHERE a.target_type = 'REQUEST'
         AND a.action_type NOT IN ('STATUS_CHANGED', 'REQUEST_ASSIGNED')
         AND d.manager_id = $1 AND d.department_id = $2
         AND d.is_active = true AND manager.is_active = true
         AND manager.user_type = 'MANAGER'
       UNION ALL
       SELECT a.target_id, a.action_type::text
       FROM admin_audit_log a
       LEFT JOIN staff_assignments assignment_staff
         ON a.target_type = 'ASSIGNMENT'
        AND assignment_staff.staff_assignment_id = a.target_id
       WHERE a.target_type IN ('USER', 'ASSIGNMENT')
         AND a.action_type IN (
           'USER_CREATED', 'USER_MODIFIED', 'USER_DEACTIVATED',
           'STAFF_ASSIGNED', 'STAFF_REMOVED'
         )
         AND (
           (a.target_type = 'USER' AND EXISTS (
             SELECT 1
             FROM staff_assignments scoped_assignment
             JOIN departments d ON d.department_id = scoped_assignment.department_id
             JOIN users manager ON manager.user_id = d.manager_id
             WHERE scoped_assignment.staff_id = a.target_id
               AND d.manager_id = $1 AND d.department_id = $2 AND d.is_active = true
               AND manager.is_active = true AND manager.user_type = 'MANAGER'
           ))
           OR
           (a.target_type = 'ASSIGNMENT' AND EXISTS (
             SELECT 1
             FROM staff_assignments scoped_assignment
             JOIN departments d ON d.department_id = scoped_assignment.department_id
             JOIN users manager ON manager.user_id = d.manager_id
             WHERE scoped_assignment.staff_assignment_id = a.target_id
               AND d.manager_id = $1 AND d.department_id = $2 AND d.is_active = true
               AND manager.is_active = true AND manager.user_type = 'MANAGER'
           ))
         )
     ) entries
     WHERE $3::text IS NULL OR action_type = $3`,
    [managerId, departmentId, actionType || null]
  );
  return result.rows[0].count;
};

exports.recordAuditEntry = async (
  client,
  { admin_id, action_type, target_type, target_id, changed_data }
) => {
  await client.query(
    `INSERT INTO admin_audit_log (admin_id, action_type, target_type, target_id, changed_data, created_at)
     VALUES ($1, $2::action_type, $3::target_type, $4, $5::json, LOCALTIMESTAMP)`,
    [admin_id, action_type, target_type, target_id, JSON.stringify(changed_data || {})]
  );
};
