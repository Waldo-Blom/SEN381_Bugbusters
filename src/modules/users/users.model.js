const { query, pool } = require('../../config/database');
const auditModel = require('../audit/audit.model');

const transaction = async (operation) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

exports.findManagerDepartment = async (managerId) => {
  const result = await query(
    `SELECT d.department_id AS "departmentId", d.name AS "departmentName"
     FROM departments d
     JOIN users manager ON manager.user_id = d.manager_id
     WHERE d.manager_id = $1 AND d.is_active = true
       AND manager.user_type = 'MANAGER' AND manager.is_active = true
     LIMIT 1`,
    [managerId]
  );
  return result.rows[0] || null;
};

exports.findStaffForManager = async (managerId, departmentId) => {
  const result = await query(
    `SELECT DISTINCT ON (staff.user_id)
            staff.user_id AS "userId", staff.first_name AS "firstName",
            staff.last_name AS "lastName", staff.email,
            (staff.is_active AND sa.is_active) AS "isActive"
     FROM staff_assignments sa
     JOIN departments d ON d.department_id = sa.department_id
     JOIN users manager ON manager.user_id = d.manager_id
     JOIN users staff ON staff.user_id = sa.staff_id
     WHERE d.manager_id = $1 AND d.department_id = $2 AND d.is_active = true
       AND manager.user_type = 'MANAGER' AND manager.is_active = true
       AND staff.user_type = 'STAFF'
     ORDER BY staff.user_id, sa.assigned_at DESC, sa.staff_assignment_id DESC`,
    [managerId, departmentId]
  );
  return result.rows;
};

exports.createStaff = (managerId, { firstName, lastName, email, phone, passwordHash }) =>
  transaction(async (client) => {
    const departmentResult = await client.query(
      `SELECT d.department_id
       FROM departments d
       JOIN users manager ON manager.user_id = d.manager_id
       WHERE d.manager_id = $1 AND d.is_active = true
         AND manager.user_type = 'MANAGER' AND manager.is_active = true
       LIMIT 1
       FOR SHARE OF d, manager`,
      [managerId]
    );
    const department = departmentResult.rows[0];
    if (!department) return { departmentMissing: true };

    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, phone, user_type)
       VALUES ($1, $2, $3, $4, $5, 'STAFF')
       ON CONFLICT (email) DO NOTHING
       RETURNING user_id AS "userId"`,
      [email, passwordHash, firstName, lastName, phone || null]
    );
    const user = userResult.rows[0];
    if (!user) return { duplicateEmail: true };

    const assignmentResult = await client.query(
      `INSERT INTO staff_assignments (staff_id, department_id, assigned_by, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING staff_assignment_id`,
      [user.userId, department.department_id, managerId]
    );
    await auditModel.recordAdminUserEvent(client, {
      actorId: managerId,
      actionType: 'USER_CREATED',
      targetType: 'USER',
      targetId: user.userId,
      changedData: { userType: 'STAFF', departmentId: department.department_id },
    });
    await auditModel.recordAdminUserEvent(client, {
      actorId: managerId,
      actionType: 'STAFF_ASSIGNED',
      targetType: 'ASSIGNMENT',
      targetId: assignmentResult.rows[0].staff_assignment_id,
      changedData: { staffId: user.userId, departmentId: department.department_id },
    });
    return { userId: user.userId };
  });

exports.deactivateStaff = (managerId, staffId) =>
  transaction(async (client) => {
    const assignmentResult = await client.query(
      `SELECT sa.staff_assignment_id, sa.department_id
       FROM staff_assignments sa
       JOIN departments d ON d.department_id = sa.department_id
       JOIN users manager ON manager.user_id = d.manager_id
       JOIN users staff ON staff.user_id = sa.staff_id
       WHERE sa.staff_id = $1 AND d.manager_id = $2 AND d.is_active = true
         AND manager.user_type = 'MANAGER' AND manager.is_active = true
         AND staff.user_type = 'STAFF' AND sa.is_active = true
       LIMIT 1
       FOR UPDATE OF sa, staff`,
      [staffId, managerId]
    );
    const assignment = assignmentResult.rows[0];
    if (!assignment) return false;

    await client.query('UPDATE users SET is_active = false WHERE user_id = $1', [staffId]);
    await client.query(
      `UPDATE staff_assignments
       SET is_active = false, removed_at = now()
       WHERE staff_assignment_id = $1 AND is_active = true`,
      [assignment.staff_assignment_id]
    );
    await auditModel.recordAdminUserEvent(client, {
      actorId: managerId,
      actionType: 'USER_DEACTIVATED',
      targetType: 'USER',
      targetId: staffId,
      changedData: { isActive: false },
    });
    await auditModel.recordAdminUserEvent(client, {
      actorId: managerId,
      actionType: 'STAFF_REMOVED',
      targetType: 'ASSIGNMENT',
      targetId: assignment.staff_assignment_id,
      changedData: { staffId, departmentId: assignment.department_id },
    });
    return true;
  });

exports.reactivateStaff = (managerId, staffId) =>
  transaction(async (client) => {
    const assignmentResult = await client.query(
      `SELECT sa.staff_assignment_id, sa.department_id,
              EXISTS (
                SELECT 1 FROM staff_assignments current_assignment
                WHERE current_assignment.staff_id = sa.staff_id
                  AND current_assignment.is_active = true
              ) AS has_active_assignment
       FROM staff_assignments sa
       JOIN departments d ON d.department_id = sa.department_id
       JOIN users manager ON manager.user_id = d.manager_id
       JOIN users staff ON staff.user_id = sa.staff_id
       WHERE sa.staff_id = $1 AND d.manager_id = $2 AND d.is_active = true
         AND manager.user_type = 'MANAGER' AND manager.is_active = true
         AND staff.user_type = 'STAFF' AND sa.is_active = false
       ORDER BY sa.assigned_at DESC, sa.staff_assignment_id DESC
       LIMIT 1
       FOR UPDATE OF sa, staff`,
      [staffId, managerId]
    );
    const assignment = assignmentResult.rows[0];
    if (!assignment) return { notFound: true };
    if (assignment.has_active_assignment) return { activeAssignmentExists: true };

    await client.query(
      `UPDATE staff_assignments
       SET is_active = true, removed_at = NULL, assigned_at = now(), assigned_by = $2
       WHERE staff_assignment_id = $1`,
      [assignment.staff_assignment_id, managerId]
    );
    await client.query('UPDATE users SET is_active = true WHERE user_id = $1', [staffId]);
    await auditModel.recordAdminUserEvent(client, {
      actorId: managerId,
      actionType: 'USER_MODIFIED',
      targetType: 'USER',
      targetId: staffId,
      changedData: { isActive: true },
    });
    await auditModel.recordAdminUserEvent(client, {
      actorId: managerId,
      actionType: 'STAFF_ASSIGNED',
      targetType: 'ASSIGNMENT',
      targetId: assignment.staff_assignment_id,
      changedData: { staffId, departmentId: assignment.department_id, reactivated: true },
    });
    return { reactivated: true };
  });

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
