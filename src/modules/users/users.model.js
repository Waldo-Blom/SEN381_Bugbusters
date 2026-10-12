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

exports.findAdminDepartments = async () => {
  const result = await query(
    `SELECT d.department_id AS "departmentId", d.name AS "departmentName",
            manager.first_name AS "managerFirstName",
            manager.last_name AS "managerLastName"
     FROM departments d
     LEFT JOIN users manager ON manager.user_id = d.manager_id
     WHERE d.is_active = true
     ORDER BY d.name`
  );
  return result.rows;
};

exports.findDepartmentsForAdmin = async () => {
  const result = await query(
    `SELECT d.department_id AS "departmentId", d.name AS "departmentName",
            d.description, d.is_active AS "isActive",
            manager.first_name AS "managerFirstName",
            manager.last_name AS "managerLastName"
     FROM departments d
     LEFT JOIN users manager ON manager.user_id = d.manager_id
     ORDER BY d.name`
  );
  return result.rows;
};

exports.findRequestCategoriesForAdmin = async () => {
  const result = await query(
    `SELECT c.category_id AS "categoryId", c.name AS "categoryName",
            c.description, c.is_active AS "isActive",
            d.department_id AS "departmentId", d.name AS "departmentName"
     FROM request_categories c
     JOIN departments d ON d.department_id = c.department_id
     ORDER BY d.name, c.name`
  );
  return result.rows;
};

exports.createRequestCategory = (adminId, { name, description, departmentId }) =>
  transaction(async (client) => {
    const departmentResult = await client.query(
      `SELECT department_id
       FROM departments
       WHERE department_id = $1 AND is_active = true
       FOR SHARE`,
      [departmentId]
    );
    if (!departmentResult.rows[0]) return { departmentMissing: true };

    const categoryResult = await client.query(
      `INSERT INTO request_categories (name, description, department_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (name) DO NOTHING
       RETURNING category_id AS "categoryId"`,
      [name, description || null, departmentId]
    );
    const category = categoryResult.rows[0];
    if (!category) return { duplicateName: true };

    await auditModel.recordAdminUserEvent(client, {
      actorId: adminId,
      actionType: 'CATEGORY_CREATED',
      targetType: 'CATEGORY',
      targetId: category.categoryId,
      changedData: { name, description: description || null, departmentId },
    });
    return { categoryId: category.categoryId };
  });

exports.findUsersForAdmin = async () => {
  const result = await query(
    `SELECT u.user_id AS "userId", u.first_name AS "firstName",
            u.last_name AS "lastName", u.email, u.user_type AS "userType",
            u.is_active AS "isActive",
            COALESCE(manager_department.department_id, staff_department.department_id)
              AS "departmentId",
            COALESCE(manager_department.name, staff_department.name) AS "departmentName"
     FROM users u
     LEFT JOIN departments manager_department
       ON manager_department.manager_id = u.user_id
     LEFT JOIN LATERAL (
       SELECT d.department_id, d.name
       FROM staff_assignments sa
       JOIN departments d ON d.department_id = sa.department_id
       WHERE sa.staff_id = u.user_id
       ORDER BY sa.is_active DESC, sa.assigned_at DESC, sa.staff_assignment_id DESC
       LIMIT 1
     ) staff_department ON true
     WHERE u.user_type IN ('MANAGER', 'STAFF')
     ORDER BY u.user_type, u.last_name, u.first_name, u.email`
  );
  return result.rows;
};

exports.createManager = (
  adminId,
  { firstName, lastName, email, phone, passwordHash, departmentId }
) =>
  transaction(async (client) => {
    const departmentResult = await client.query(
      `SELECT department_id
       FROM departments
       WHERE department_id = $1 AND is_active = true
       FOR UPDATE`,
      [departmentId]
    );
    if (!departmentResult.rows[0]) return { departmentMissing: true };

    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, phone, user_type)
       VALUES ($1, $2, $3, $4, $5, 'MANAGER')
       ON CONFLICT (email) DO NOTHING
       RETURNING user_id AS "userId"`,
      [email, passwordHash, firstName, lastName, phone || null]
    );
    const user = userResult.rows[0];
    if (!user) return { duplicateEmail: true };

    await client.query(
      `UPDATE departments SET manager_id = $1, updated_at = now()
       WHERE department_id = $2`,
      [user.userId, departmentId]
    );
    await auditModel.recordAdminUserEvent(client, {
      actorId: adminId,
      actionType: 'USER_CREATED',
      targetType: 'USER',
      targetId: user.userId,
      changedData: { userType: 'MANAGER', departmentId },
    });
    await auditModel.recordAdminUserEvent(client, {
      actorId: adminId,
      actionType: 'MANAGER_CREATED',
      targetType: 'USER',
      targetId: user.userId,
      changedData: { departmentId },
    });
    return { userId: user.userId };
  });

exports.createDepartment = (adminId, { name, description }) =>
  transaction(async (client) => {
    const departmentResult = await client.query(
      `INSERT INTO departments (name, description, manager_id)
       VALUES ($1, $2, NULL)
       ON CONFLICT (name) DO NOTHING
       RETURNING department_id AS "departmentId"`,
      [name, description || null]
    );
    const department = departmentResult.rows[0];
    if (!department) return { duplicateName: true };

    await auditModel.recordAdminUserEvent(client, {
      actorId: adminId,
      actionType: 'DEPARTMENT_CREATED',
      targetType: 'DEPARTMENT',
      targetId: department.departmentId,
      changedData: { name, description: description || null },
    });
    return { departmentId: department.departmentId };
  });

exports.deactivateUserForAdmin = (adminId, userId) =>
  transaction(async (client) => {
    const userResult = await client.query(
      `SELECT user_type, is_active FROM users
       WHERE user_id = $1 AND user_type IN ('MANAGER', 'STAFF')
       FOR UPDATE`,
      [userId]
    );
    const user = userResult.rows[0];
    if (!user || !user.is_active) return false;

    await client.query('UPDATE users SET is_active = false WHERE user_id = $1', [userId]);
    await auditModel.recordAdminUserEvent(client, {
      actorId: adminId,
      actionType: 'USER_DEACTIVATED',
      targetType: 'USER',
      targetId: userId,
      changedData: { isActive: false },
    });
    if (user.user_type === 'STAFF') {
      const assignments = await client.query(
        `UPDATE staff_assignments
         SET is_active = false, removed_at = now()
         WHERE staff_id = $1 AND is_active = true
         RETURNING staff_assignment_id, department_id`,
        [userId]
      );
      for (const assignment of assignments.rows) {
        await auditModel.recordAdminUserEvent(client, {
          actorId: adminId,
          actionType: 'STAFF_REMOVED',
          targetType: 'ASSIGNMENT',
          targetId: assignment.staff_assignment_id,
          changedData: { staffId: userId, departmentId: assignment.department_id },
        });
      }
    } else {
      await auditModel.recordAdminUserEvent(client, {
        actorId: adminId,
        actionType: 'MANAGER_REMOVED',
        targetType: 'USER',
        targetId: userId,
        changedData: { isActive: false },
      });
    }
    return true;
  });

exports.reactivateUserForAdmin = (adminId, userId) =>
  transaction(async (client) => {
    const userResult = await client.query(
      `SELECT user_type, is_active FROM users
       WHERE user_id = $1 AND user_type IN ('MANAGER', 'STAFF')
       FOR UPDATE`,
      [userId]
    );
    const user = userResult.rows[0];
    if (!user || user.is_active) return { notFound: true };

    let assignment = null;
    if (user.user_type === 'STAFF') {
      const assignmentResult = await client.query(
        `SELECT staff_assignment_id, department_id
         FROM staff_assignments
         WHERE staff_id = $1
         ORDER BY assigned_at DESC, staff_assignment_id DESC
         LIMIT 1
         FOR UPDATE`,
        [userId]
      );
      assignment = assignmentResult.rows[0];
      if (!assignment) return { notFound: true };
      const activeResult = await client.query(
        `SELECT 1 FROM staff_assignments
         WHERE staff_id = $1 AND is_active = true
         LIMIT 1`,
        [userId]
      );
      if (activeResult.rows.length) return { activeAssignmentExists: true };
    }

    await client.query('UPDATE users SET is_active = true WHERE user_id = $1', [userId]);
    if (assignment) {
      await client.query(
        `UPDATE staff_assignments
         SET is_active = true, removed_at = NULL, assigned_at = now(), assigned_by = $2
         WHERE staff_assignment_id = $1`,
        [assignment.staff_assignment_id, adminId]
      );
    }
    await auditModel.recordAdminUserEvent(client, {
      actorId: adminId,
      actionType: 'USER_MODIFIED',
      targetType: 'USER',
      targetId: userId,
      changedData: { isActive: true },
    });
    if (assignment) {
      await auditModel.recordAdminUserEvent(client, {
        actorId: adminId,
        actionType: 'STAFF_ASSIGNED',
        targetType: 'ASSIGNMENT',
        targetId: assignment.staff_assignment_id,
        changedData: { staffId: userId, departmentId: assignment.department_id, reactivated: true },
      });
    }
    return { reactivated: true };
  });
