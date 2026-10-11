const { query, pool } = require('../../config/database');

const toTitleCase = (str) => {
  if (!str) return '';
  return str
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const formatDate = (date) => {
  if (!date) return '';
  return new Date(date).toISOString().slice(0, 16).replace('T', ' ');
};

const requestsSelect = `
  SELECT
    r.request_id, r.request_number, r.title, r.description, r.status, r.priority, r.location,
    r.created_at, r.updated_at, r.overdue_flag,
    c.name as category_name,
    d.name as department_name,
    u.first_name || ' ' || u.last_name as requester_name,
    u.email as requester_email,
    u.phone as requester_phone,
    ext.first_name || ' ' || ext.last_name as ext_requester_name,
    ext.email as ext_requester_email,
    ext.phone as ext_requester_phone,
    staff.first_name || ' ' || staff.last_name as assigned_to_name,
    creator.first_name || ' ' || creator.last_name as created_by_name,
    (SELECT COUNT(*) FROM request_attachments WHERE request_id = r.request_id) as attachment_count
  FROM service_requests r
  LEFT JOIN request_categories c ON r.category_id = c.category_id
  LEFT JOIN departments d ON c.department_id = d.department_id
  LEFT JOIN users u ON r.requester_id = u.user_id
  LEFT JOIN external_requesters ext ON r.external_requester_id = ext.external_requester_id
  LEFT JOIN users staff ON r.assigned_staff_id = staff.user_id
  LEFT JOIN users creator ON r.created_by = creator.user_id
`;

const mapRowToRequest = (row) => ({
  id: row.request_id,
  reference: row.request_number,
  title: row.title,
  description: row.description,
  category: row.category_name,
  department: row.department_name,
  status: toTitleCase(row.status),
  priority: toTitleCase(row.priority),
  location: row.location,
  requesterName: row.requester_name || row.ext_requester_name || 'Unknown',
  requesterEmail: row.requester_email || row.ext_requester_email || '',
  requesterPhone: row.requester_phone || row.ext_requester_phone || '',
  submittedAt: formatDate(row.created_at),
  updatedAt: formatDate(row.updated_at),
  assignedTo: row.assigned_to_name || 'Unassigned',
  createdBy: row.created_by_name || '',
  hasAttachment: parseInt(row.attachment_count) > 0,
  attachmentCount: parseInt(row.attachment_count) || 0,
  overdue: row.overdue_flag || false,
  comments: [],
  timeline: [],
});

exports.findAll = async () => {
  const sql = `${requestsSelect} ORDER BY r.created_at DESC`;
  const result = await query(sql);
  return result.rows.map(mapRowToRequest);
};

exports.findCategories = async () => {
  const result = await query(
    `SELECT category_id AS id, name
    FROM request_categories
    WHERE is_active = true
    ORDER BY display_order, name`
  );
  return result.rows;
};

exports.findActiveCategory = async (id) => {
  const result = await query(
    `SELECT category_id AS id, name
    FROM request_categories
    WHERE category_id = $1 AND is_active = true`,
    [id]
  );
  return result.rows[0] || null;
};

exports.findGenericActiveUserId = async (userTypes) => {
  const findUser = () =>
    query(
      `SELECT user_id
      FROM users
      WHERE user_type = ANY($1::user_type[]) AND is_active = true
      ORDER BY CASE WHEN user_type = $2 THEN 0 ELSE 1 END, created_at, user_id
      LIMIT 1`,
      [userTypes, userTypes[0]]
    );
  const result = await findUser();
  if (result.rows[0]) {
    return result.rows[0].user_id;
  }

  // TODO: Remove these placeholder accounts when database-backed authentication is implemented.
  const userType = userTypes[0];
  const label = userType === 'REQUESTER' ? 'Requester' : 'Staff';
  const email = `demo-${userType.toLowerCase()}@civicconnect.local`;
  const created = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, user_type)
    VALUES ($1, $2, 'Demo', $3, $4)
    ON CONFLICT (email) DO NOTHING
    RETURNING user_id`,
    [email, 'AUTH_NOT_IMPLEMENTED', label, userType]
  );
  if (created.rows[0]) {
    return created.rows[0].user_id;
  }

  const retry = await findUser();
  return retry.rows[0]?.user_id || null;
};

exports.create = async (input, generateRequestNumber) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const year = new Date().getFullYear();
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `service-request-number:${year}`,
    ]);
    const sequenceResult = await client.query(
      `SELECT COALESCE(MAX(SPLIT_PART(request_number, '-', 3)::integer), 0) AS last_sequence
      FROM service_requests
      WHERE request_number LIKE $1`,
      [`CC-${year}-%`]
    );
    const requestNumber = generateRequestNumber(
      year,
      Number(sequenceResult.rows[0].last_sequence) + 1
    );

    let externalRequesterId = null;
    if (input.externalRequester) {
      const externalResult = await client.query(
        `INSERT INTO external_requesters
          (first_name, last_name, phone, email, preferred_contact_method)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING external_requester_id`,
        [
          input.externalRequester.firstName,
          input.externalRequester.lastName,
          input.externalRequester.phone,
          input.externalRequester.email,
          input.externalRequester.preferredContactMethod,
        ]
      );
      externalRequesterId = externalResult.rows[0].external_requester_id;
    }

    const requestResult = await client.query(
      `INSERT INTO service_requests
        (request_number, requester_id, external_requester_id, created_by,
         category_id, title, description, location, priority)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING request_id, request_number, status, created_at`,
      [
        requestNumber,
        input.requesterId,
        externalRequesterId,
        input.createdBy,
        input.categoryId,
        input.title,
        input.description,
        input.location,
        input.priority,
      ]
    );

    await client.query('COMMIT');
    return requestResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

exports.findByRequesterId = async (userId) => {
  const sql = `${requestsSelect} WHERE r.requester_id = $1 ORDER BY r.created_at DESC`;
  const result = await query(sql, [userId]);
  return result.rows.map(mapRowToRequest);
};

exports.findByCreatorId = async (userId) => {
  const sql = `${requestsSelect}
    WHERE r.created_by = $1
    ORDER BY r.created_at DESC`;
  const result = await query(sql, [userId]);
  return result.rows.map(mapRowToRequest);
};

exports.findById = async (id) => {
  const sql = `
    SELECT 
      r.request_id, r.request_number, r.title, r.description, r.status, r.priority, r.location, 
      r.created_at, r.updated_at, r.overdue_flag,
      c.name as category_name,
      d.name as department_name,
      u.first_name || ' ' || u.last_name as requester_name,
      u.email as requester_email,
      u.phone as requester_phone,
      ext.first_name || ' ' || ext.last_name as ext_requester_name,
      ext.email as ext_requester_email,
      ext.phone as ext_requester_phone,
      staff.first_name || ' ' || staff.last_name as assigned_to_name,
      (SELECT COUNT(*) FROM request_attachments WHERE request_id = r.request_id) as attachment_count
    FROM service_requests r
    LEFT JOIN request_categories c ON r.category_id = c.category_id
    LEFT JOIN departments d ON c.department_id = d.department_id
    LEFT JOIN users u ON r.requester_id = u.user_id
    LEFT JOIN external_requesters ext ON r.external_requester_id = ext.external_requester_id
    LEFT JOIN users staff ON r.assigned_staff_id = staff.user_id
    WHERE r.request_id = $1
  `;
  const result = await query(sql, [id]);
  if (result.rows.length === 0) return null;
  const request = mapRowToRequest(result.rows[0]);

  // Fetch comments
  const commentsSql = `
    SELECT 
      rc.comment_id, rc.content, rc.created_at, 
      u.first_name || ' ' || u.last_name as author_name,
      u.user_type
    FROM request_comments rc
    LEFT JOIN users u ON rc.commented_by = u.user_id
    WHERE rc.request_id = $1
    ORDER BY rc.created_at ASC
  `;
  const commentsResult = await query(commentsSql, [id]);
  request.comments = commentsResult.rows.map((row) => ({
    id: row.comment_id,
    author: row.author_name || 'System',
    authorRole: toTitleCase(row.user_type || 'Staff'),
    text: row.content,
    timestamp: formatDate(row.created_at),
  }));

  // Fetch timeline
  const historySql = `
    SELECT 
      h.status_history_id, h.new_status, h.changed_at,
      u.first_name || ' ' || u.last_name as actor_name
    FROM request_status_history h
    LEFT JOIN users u ON h.changed_by = u.user_id
    WHERE h.request_id = $1
    ORDER BY h.changed_at ASC
  `;
  const historyResult = await query(historySql, [id]);
  request.timeline = historyResult.rows.map((row) => ({
    id: row.status_history_id,
    status: toTitleCase(row.new_status),
    label: `Status changed to ${toTitleCase(row.new_status)}`,
    timestamp: formatDate(row.changed_at),
    actor: row.actor_name || 'System',
  }));

  return request;
};

exports.updateStatus = async (id, newStatus, comment) => {
  const dbStatus = newStatus.toUpperCase().replace(' ', '_');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check current status using FOR UPDATE
    const reqRes = await client.query(
      'SELECT status FROM service_requests WHERE request_id = $1 FOR UPDATE',
      [id]
    );
    if (reqRes.rows.length === 0) throw new Error('Request not found');
    const oldDbStatus = reqRes.rows[0].status;

    const now = new Date();

    // Update status
    await client.query(
      'UPDATE service_requests SET status = $1, updated_at = $2 WHERE request_id = $3',
      [dbStatus, now, id]
    );

    // Find a generic staff user for the comment author / history since we don't pass userId from the model yet
    let genericUserId = null;
    const userRes = await client.query(
      "SELECT user_id FROM users WHERE user_type IN ('STAFF', 'MANAGER', 'ADMIN') LIMIT 1"
    );
    if (userRes.rows.length > 0) {
      genericUserId = userRes.rows[0].user_id;
    }

    // Insert into status history if it changed
    if (oldDbStatus !== dbStatus && genericUserId) {
      await client.query(
        'INSERT INTO request_status_history (request_id, old_status, new_status, changed_by, changed_at) VALUES ($1, $2, $3, $4, $5)',
        [id, oldDbStatus, dbStatus, genericUserId, now]
      );
    }

    // If there's a comment
    if (comment && genericUserId) {
      await client.query(
        'INSERT INTO request_comments (request_id, commented_by, content, created_at) VALUES ($1, $2, $3, $4)',
        [id, genericUserId, comment, now]
      );
    }

    await client.query('COMMIT');

    return exports.findById(id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
