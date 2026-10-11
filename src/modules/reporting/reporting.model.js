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

// Dashboard projection deliberately excludes requester contact information.
exports.findDashboardRequests = async (managerId, departmentId) => {
  const result = await query(
    `SELECT r.request_id AS id, r.request_number AS reference, r.title,
            r.status, r.priority, r.overdue_flag, r.updated_at,
            c.name AS category
     FROM service_requests r
     JOIN request_categories c ON c.category_id = r.category_id
     JOIN departments d ON d.department_id = c.department_id
     JOIN users u ON u.user_id = d.manager_id
     WHERE d.department_id = $1 AND d.manager_id = $2
       AND d.is_active = true AND u.is_active = true AND u.user_type = 'MANAGER'
     ORDER BY r.created_at DESC, r.request_id`,
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
