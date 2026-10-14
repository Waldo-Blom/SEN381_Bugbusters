const bcrypt = require('bcrypt');
const { query } = require('../../config/database');

const BCRYPT_ROUNDS = 12;

const createRequester = async ({ firstName, lastName, email, phone, password }) => {
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const result = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, phone, user_type)
     VALUES ($1, $2, $3, $4, $5, 'REQUESTER')
     ON CONFLICT (email) DO NOTHING
     RETURNING user_id, email, first_name, last_name, user_type`,
    [email, passwordHash, firstName, lastName, phone || null]
  );

  return result.rows[0] || null;
};

const authenticate = async (email, password) => {
  const result = await query(
    `SELECT u.user_id, u.email, u.first_name, u.last_name, u.password_hash, u.user_type,
            COALESCE(
              (
                SELECT sa.department_id
                FROM staff_assignments sa
                WHERE sa.staff_id = u.user_id AND sa.is_active = true
                ORDER BY sa.assigned_at DESC
                LIMIT 1
              ),
              (
                SELECT d.department_id
                FROM departments d
                WHERE d.manager_id = u.user_id
                LIMIT 1
              )
            ) AS department_id
     FROM users u
     WHERE u.email = $1 AND u.is_active = true
     LIMIT 1`,
    [email]
  );
  const user = result.rows[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return null;
  }

  await query('UPDATE users SET last_login_at = now() WHERE user_id = $1', [user.user_id]);

  const roleByUserType = {
    REQUESTER: 'requester',
    STAFF: 'staff',
    MANAGER: 'management',
    ADMIN: 'admin',
    OPERATOR: 'operator',
  };
  const role = roleByUserType[user.user_type];
  if (!role) {
    return null;
  }

  return {
    id: user.user_id,
    name: `${user.first_name} ${user.last_name}`,
    email: user.email,
    role,
    departmentId: user.department_id || null,
    avatarInitials: `${user.first_name[0]}${user.last_name[0]}`.toUpperCase(),
  };
};

module.exports = { createRequester, authenticate };
