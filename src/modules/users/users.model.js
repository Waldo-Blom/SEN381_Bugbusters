const { query } = require('../../config/database');
const { mockStaffUsers } = require('../../../db/mock/mockData');

exports.findStaff = () => mockStaffUsers;

/**
 * Finds the active department assigned to a staff user.
 * @param {string} staffUserId - UUID of the staff member
 * @returns {Promise<{ departmentId: string, departmentName: string } | null>}
 */
exports.findStaffDepartment = async (staffUserId) => {
  if (!staffUserId) return null;
  const sql = `
    SELECT d.department_id AS "departmentId", d.name AS "departmentName"
    FROM staff_assignments sa
    JOIN departments d ON sa.department_id = d.department_id
    WHERE sa.staff_id = $1 AND sa.is_active = true AND d.is_active = true
    ORDER BY sa.assigned_at DESC
    LIMIT 1
  `;
  const result = await query(sql, [staffUserId]);
  return result.rows[0] || null;
};

/**
 * Checks whether a staff member has active access to a specific department.
 * @param {string} staffUserId
 * @param {string} departmentId
 * @returns {Promise<boolean>}
 */
exports.hasDepartmentAccess = async (staffUserId, departmentId) => {
  if (!staffUserId || !departmentId) return false;
  const sql = `
    SELECT 1 FROM staff_assignments sa
    JOIN departments d ON sa.department_id = d.department_id
    WHERE sa.staff_id = $1 AND sa.department_id = $2
      AND sa.is_active = true AND d.is_active = true
    LIMIT 1
  `;
  const result = await query(sql, [staffUserId, departmentId]);
  return result.rows.length > 0;
};

/**
 * Verifies if a staff user is authorized to access a given request based on department category.
 * @param {string} staffUserId
 * @param {string} requestId
 * @returns {Promise<{ allowed: boolean, reason?: string, departmentId?: string, departmentName?: string }>}
 */
exports.verifyStaffRequestAccess = async (staffUserId, requestId) => {
  if (!staffUserId) {
    return { allowed: false, reason: 'Staff user ID is required.' };
  }
  if (!requestId) {
    return { allowed: false, reason: 'Request ID is required.' };
  }

  const sql = `
    SELECT 
      r.request_id,
      c.department_id AS request_department_id,
      d.name AS request_department_name,
      sa.department_id AS staff_department_id
    FROM service_requests r
    JOIN request_categories c ON r.category_id = c.category_id
    JOIN departments d ON c.department_id = d.department_id
    LEFT JOIN staff_assignments sa 
      ON sa.staff_id = $1 AND sa.department_id = c.department_id AND sa.is_active = true
    WHERE r.request_id = $2
  `;
  const result = await query(sql, [staffUserId, requestId]);
  if (result.rows.length === 0) {
    return { allowed: false, reason: 'Request not found.' };
  }

  const row = result.rows[0];
  if (!row.staff_department_id) {
    return {
      allowed: false,
      reason: `You do not have permission to access requests for the ${row.request_department_name} department.`,
      departmentId: row.request_department_id,
      departmentName: row.request_department_name,
    };
  }

  return {
    allowed: true,
    departmentId: row.request_department_id,
    departmentName: row.request_department_name,
  };
};
