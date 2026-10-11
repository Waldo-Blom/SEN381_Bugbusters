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
