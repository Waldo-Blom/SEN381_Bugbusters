const { query } = require('../../config/database');
const { auditLog } = require('../../../db/mock/mockData');

exports.getAuditLog = () => auditLog;

exports.findManagedDepartment = async (managerId) => {
  const result = await query(
    `SELECT d.department_id AS id, d.name
     FROM departments d
     JOIN users u ON u.user_id = d.manager_id
     WHERE d.manager_id = $1 AND d.is_active = true
       AND u.is_active = true AND u.user_type = 'MANAGER'`,
    [managerId]
  );
  return result.rows[0] || null;
};

// A bounded event feed, scoped before joining history. No contact details or
// comment bodies are returned to the dashboard.
exports.findRecentActivity = async (managerId, departmentId) => {
  const result = await query(
    `WITH scoped AS (
       SELECT r.request_id, r.request_number, r.title, r.status, r.priority,
              r.created_at, r.created_by, c.name AS category
       FROM service_requests r
       JOIN request_categories c ON c.category_id = r.category_id
       JOIN departments d ON d.department_id = c.department_id
       JOIN users u ON u.user_id = d.manager_id
       WHERE d.department_id = $1 AND d.manager_id = $2
         AND d.is_active = true AND u.is_active = true AND u.user_type = 'MANAGER'
     ), events AS (
       SELECT request_id, request_id::text AS event_id, 'submission' AS event_type,
              created_at AS occurred_at, created_by AS actor_id,
              NULL::text AS event_status, NULL::text AS comment_type,
              NULL::uuid AS assignee_id
       FROM scoped
       UNION ALL
       SELECT h.request_id, h.status_history_id::text, 'status', h.changed_at,
              h.changed_by, h.new_status::text, NULL::text, NULL::uuid
       FROM request_status_history h JOIN scoped s USING (request_id)
       UNION ALL
       SELECT a.request_id, a.assignment_history_id::text, 'assignment', a.assigned_at,
              a.assigned_by_id, NULL::text, NULL::text, a.assigned_to_staff_id
       FROM request_assignment_history a JOIN scoped s USING (request_id)
       UNION ALL
       SELECT c.request_id, c.comment_id::text, 'comment', c.created_at,
              c.commented_by, NULL::text, c.comment_type::text, NULL::uuid
       FROM request_comments c JOIN scoped s USING (request_id)
       WHERE c.is_deleted IS NOT TRUE
     )
     SELECT s.request_id AS id, s.request_number AS reference, s.title,
            s.category, s.status, s.priority, e.event_id, e.event_type,
            e.event_status, e.comment_type,
            to_char(e.occurred_at, 'YYYY-MM-DD HH24:MI') AS timestamp,
            NULLIF(concat_ws(' ', actor.first_name, actor.last_name), '') AS actor,
            NULLIF(concat_ws(' ', staff.first_name, staff.last_name), '') AS assignee
     FROM events e JOIN scoped s USING (request_id)
     LEFT JOIN users actor ON actor.user_id = e.actor_id
     LEFT JOIN users staff ON staff.user_id = e.assignee_id
     ORDER BY e.occurred_at DESC, e.event_type, e.event_id
     LIMIT 10`,
    [departmentId, managerId]
  );
  return result.rows;
};

// Calculate durations in PostgreSQL so timestamp-without-time-zone values are
// compared in the same database timezone, rather than the Node host timezone.
exports.findDashboardStats = async (managerId, departmentId) => {
  const result = await query(
    `WITH scoped AS (
       SELECT r.request_id, r.status, r.created_at, r.assigned_at, r.resolved_at,
              COALESCE(r.expected_completion_at,
                       r.created_at + c.target_resolution_time) AS deadline
       FROM service_requests r
       JOIN request_categories c ON c.category_id = r.category_id
       JOIN departments d ON d.department_id = c.department_id
       JOIN users u ON u.user_id = d.manager_id
       WHERE d.department_id = $1 AND d.manager_id = $2
         AND d.is_active = true AND u.is_active = true AND u.user_type = 'MANAGER'
     ), timings AS (
       SELECT s.*,
              (SELECT MIN(events.at)
               FROM (
                 SELECT s.assigned_at AS at
                 UNION ALL
                 SELECT a.assigned_at FROM request_assignment_history a
                   WHERE a.request_id = s.request_id AND a.assigned_to_staff_id IS NOT NULL
                 UNION ALL
                 SELECT h.changed_at FROM request_status_history h
                   WHERE h.request_id = s.request_id AND h.new_status = 'ASSIGNED'
               ) events WHERE events.at >= s.created_at) AS first_response_at,
              COALESCE(s.resolved_at,
                (SELECT MAX(h.changed_at) FROM request_status_history h
                 WHERE h.request_id = s.request_id AND h.new_status = 'RESOLVED'
                   AND h.changed_at >= s.created_at)) AS completion_at
       FROM scoped s
     )
     SELECT COUNT(*) FILTER (WHERE status IN ('SUBMITTED', 'ASSIGNED', 'IN_PROGRESS')) AS open,
            COUNT(*) FILTER (WHERE status IN ('SUBMITTED', 'ASSIGNED', 'IN_PROGRESS')
              AND deadline < LOCALTIMESTAMP) AS overdue,
            COUNT(*) FILTER (WHERE status = 'RESOLVED') AS resolved,
            COUNT(*) FILTER (WHERE status = 'CLOSED') AS closed,
            COUNT(*) FILTER (WHERE status <> 'REJECTED') AS eligible_total,
            AVG(EXTRACT(EPOCH FROM (first_response_at - created_at)) / 3600.0)
              FILTER (WHERE first_response_at <= LOCALTIMESTAMP) AS avg_response_hours,
            COUNT(*) FILTER (WHERE status IN ('RESOLVED', 'CLOSED')
              AND deadline IS NOT NULL AND completion_at >= created_at
              AND completion_at <= LOCALTIMESTAMP) AS sla_total,
            COUNT(*) FILTER (WHERE status IN ('RESOLVED', 'CLOSED')
              AND deadline IS NOT NULL AND completion_at >= created_at
              AND completion_at <= LOCALTIMESTAMP AND completion_at <= deadline) AS sla_met
     FROM timings`,
    [departmentId, managerId]
  );
  return result.rows[0];
};
