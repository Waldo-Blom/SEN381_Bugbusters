const { query, pool } = require('../../config/database');
const { requireStaffAccess } = require('./requests.access');
const { ALLOWED_TRANSITIONS } = require('./requests.constants');

const staffMembership = `EXISTS (
  SELECT 1 FROM staff_assignments sa JOIN users viewer ON viewer.user_id = sa.staff_id
  WHERE sa.staff_id = $2 AND sa.department_id = c.department_id AND sa.is_active = true
    AND viewer.is_active = true AND viewer.user_type = 'STAFF' AND d.is_active = true
)`;

exports.findAccessContext = async (id, staffId, client = { query }) => {
  const result = await client.query(
    `SELECT r.assigned_staff_id, r.contact_information_approved, r.status,
      ${staffMembership} AS staff_allowed
     FROM service_requests r JOIN request_categories c ON c.category_id = r.category_id
     JOIN departments d ON d.department_id = c.department_id WHERE r.request_id = $1`,
    [id, staffId]
  );
  const row = result.rows[0];
  return row ? { ...row, status: toTitleCase(row.status) } : null;
};

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

// Suppress contact fields in PostgreSQL before they reach staff-facing code.
const contactProjection = (condition) =>
  [
    ["u.first_name || ' ' || u.last_name", 'requester_name'],
    ['u.email', 'requester_email'],
    ['u.phone', 'requester_phone'],
    ["ext.first_name || ' ' || ext.last_name", 'ext_requester_name'],
    ['ext.email', 'ext_requester_email'],
    ['ext.phone', 'ext_requester_phone'],
  ]
    .map(
      ([expression, alias]) =>
        `${condition ? `CASE WHEN ${condition} THEN ${expression} ELSE NULL END` : expression} as ${alias}`
    )
    .join(',\n');

const requestsSelect = (contactCondition) => `
  SELECT
    r.request_id, r.request_number, r.title, r.description, r.status, r.priority, r.location,
    r.created_at, r.updated_at, r.overdue_flag,
    r.category_id,
    r.assigned_staff_id, r.contact_information_approved,
    ${contactCondition && contactCondition !== 'false' ? `${staffMembership} AS staff_allowed,` : ''}
    ${
      contactCondition && contactCondition !== 'false'
        ? `(SELECT a.status FROM request_contact_access_requests a
      WHERE a.request_id = r.request_id AND a.requested_by = $2 AND a.department_id = c.department_id
      ORDER BY a.requested_at DESC, a.contact_access_request_id DESC LIMIT 1) AS contact_access_status,`
        : ''
    }
    c.name as category_name,
    c.department_id,
    d.name as department_name,
    ${contactProjection(contactCondition)},
    staff.first_name || ' ' || staff.last_name as assigned_to_name,
    ${contactCondition ? 'NULL' : "creator.first_name || ' ' || creator.last_name"} as created_by_name,
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
  categoryId: row.category_id || null,
  category: row.category_name,
  departmentId: row.department_id || null,
  department: row.department_name,
  status: toTitleCase(row.status),
  priority: toTitleCase(row.priority),
  location: row.location,
  requesterName: row.requester_name || row.ext_requester_name || 'Unknown',
  requesterEmail: row.requester_email || row.ext_requester_email || '',
  requesterPhone: row.requester_phone || row.ext_requester_phone || '',
  submittedAt: formatDate(row.created_at),
  updatedAt: formatDate(row.updated_at),
  assignedStaffId: row.assigned_staff_id || null,
  assignedTo: row.assigned_to_name || 'Unassigned',
  createdBy: row.created_by_name || '',
  hasAttachment: parseInt(row.attachment_count) > 0,
  attachmentCount: parseInt(row.attachment_count) || 0,
  overdue: row.overdue_flag || false,
  comments: [],
  timeline: [],
  contactInformationApproved: row.contact_information_approved === true,
});

exports.findAll = async () => {
  const sql = `${requestsSelect()} ORDER BY r.created_at DESC`;
  const result = await query(sql);
  return result.rows.map(mapRowToRequest);
};

exports.findForStaff = async (staffId) => {
  // Staff lists do not need contact data, including for approved requests.
  const result = await query(
    `${requestsSelect('false')} WHERE ${staffMembership.replace('$2', '$1')} ORDER BY r.created_at DESC`,
    [staffId]
  );
  return result.rows.map((row) => ({ ...mapRowToRequest(row), requesterName: 'Restricted' }));
};

// LEFT JOIN preserves the managed department even when it has no requests.
// This list projection fetches names, but never requester email or phone.
exports.findForManager = async (managerId, filters = {}) => {
  // Escape LIKE metacharacters so search text is treated literally.
  const search = (filters.q || '').replace(/[\\%_]/g, '\\$&');
  const result = await query(
    `SELECT d.department_id, d.name AS department_name,
            ARRAY(SELECT unnest(enum_range(NULL::request_status))::text) AS statuses,
            (SELECT COALESCE(json_agg(options ORDER BY options.name), '[]'::json)
             FROM (SELECT category_id AS id, name FROM request_categories available
                   WHERE available.department_id = d.department_id
                     AND (available.is_active = true OR EXISTS
                       (SELECT 1 FROM service_requests existing
                        WHERE existing.category_id = available.category_id))) options) AS categories,
            r.request_id, r.request_number, r.title, r.status, r.priority,
            r.created_at, c.name AS category_name,
            COALESCE(NULLIF(concat_ws(' ', citizen.first_name, citizen.last_name), ''),
                     NULLIF(concat_ws(' ', ext.first_name, ext.last_name), ''),
                     'Unknown') AS requester_name
     FROM departments d
     JOIN users manager ON manager.user_id = d.manager_id
     LEFT JOIN request_categories c ON c.department_id = d.department_id
     LEFT JOIN service_requests r ON r.category_id = c.category_id
       AND ($2::text = '' OR r.status::text = $2::text)
       AND ($3::text = '' OR c.category_id::text = $3::text)
       AND ($4::text = '' OR r.title ILIKE $4 ESCAPE E'\\\\'
            OR r.request_number ILIKE $4 ESCAPE E'\\\\')
     LEFT JOIN users citizen ON citizen.user_id = r.requester_id
     LEFT JOIN external_requesters ext ON ext.external_requester_id = r.external_requester_id
     WHERE d.manager_id = $1 AND d.is_active = true
       AND manager.is_active = true AND manager.user_type = 'MANAGER'
     ORDER BY r.created_at DESC NULLS LAST, r.request_id`,
    [managerId, filters.status || '', filters.category || '', search ? `%${search}%` : '']
  );
  if (!result.rows.length) return null;
  return {
    department: { id: result.rows[0].department_id, name: result.rows[0].department_name },
    statuses: (result.rows[0].statuses || []).map((value) => ({
      value,
      label: toTitleCase(value),
    })),
    categories: result.rows[0].categories || [],
    requests: result.rows
      .filter((row) => row.request_id)
      .map((row) => ({
        id: row.request_id,
        reference: row.request_number,
        title: row.title,
        category: row.category_name,
        status: toTitleCase(row.status),
        priority: toTitleCase(row.priority),
        requesterName: row.requester_name,
        submittedAt: formatDate(row.created_at),
      })),
  };
};

exports.findCategories = async () => {
  const result = await query(
    `SELECT category_id AS id, name
    FROM request_categories
    WHERE is_active = true
    ORDER BY name`
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

exports.searchExternalRequesters = async (searchTerm) => {
  const result = await query(
    `SELECT
      external_requester_id AS id,
      first_name AS "firstName",
      last_name AS "lastName",
      phone,
      email,
      preferred_contact_method AS "preferredContactMethod"
    FROM external_requesters
    WHERE first_name ILIKE $1
      OR last_name ILIKE $1
      OR concat_ws(' ', first_name, last_name) ILIKE $1
      OR email ILIKE $1
      OR phone ILIKE $1
    ORDER BY last_name, first_name
    LIMIT 10`,
    [`%${searchTerm}%`]
  );
  return result.rows;
};

exports.findExternalRequesterById = async (id) => {
  const result = await query(
    `SELECT
      external_requester_id AS id,
      first_name AS "firstName",
      last_name AS "lastName",
      phone,
      email,
      preferred_contact_method AS "preferredContactMethod"
    FROM external_requesters
    WHERE external_requester_id = $1`,
    [id]
  );
  return result.rows[0] || null;
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

    let externalRequesterId = input.externalRequesterId || null;
    if (input.externalRequester && !externalRequesterId) {
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

exports.findByRequesterId = async (userId, filters = {}) => {
  const conditions = ['r.requester_id = $1'];
  const params = [userId];

  const q = typeof filters.q === 'string' ? filters.q.trim() : '';
  if (q) {
    const escaped = q.replace(/[\\%_]/g, '\\$&');
    params.push(`%${escaped}%`);
    const pIdx = params.length;
    conditions.push(
      `(r.title ILIKE $${pIdx} ESCAPE E'\\\\' OR r.request_number ILIKE $${pIdx} ESCAPE E'\\\\')`
    );
  }

  const status = typeof filters.status === 'string' ? filters.status.trim() : '';
  if (status && status.toLowerCase() !== 'all') {
    const dbStatus = status.toUpperCase().replace(/\s+/g, '_');
    params.push(dbStatus);
    const pIdx = params.length;
    conditions.push(`r.status::text = $${pIdx}`);
  }

  const sql = `${requestsSelect()} WHERE ${conditions.join(' AND ')} ORDER BY r.created_at DESC`;
  const result = await query(sql, params);
  return result.rows.map(mapRowToRequest);
};

exports.getRequesterSummaryCounts = async (userId) => {
  const result = await query(
    `SELECT 
      COUNT(*)::int AS total,
      COUNT(CASE WHEN status = 'SUBMITTED' THEN 1 END)::int AS submitted,
      COUNT(CASE WHEN status = 'IN_PROGRESS' THEN 1 END)::int AS in_progress,
      COUNT(CASE WHEN status = 'RESOLVED' THEN 1 END)::int AS resolved,
      COUNT(CASE WHEN status = 'CLOSED' THEN 1 END)::int AS closed
     FROM service_requests
     WHERE requester_id = $1`,
    [userId]
  );
  const row = result.rows[0] || {};
  return {
    total: row.total || 0,
    submitted: row.submitted || 0,
    inProgress: row.in_progress || 0,
    resolved: row.resolved || 0,
    closed: row.closed || 0,
  };
};

exports.addComment = async (requestId, userId, content, commentType = 'NOTE') => {
  const result = await query(
    `INSERT INTO request_comments (request_id, commented_by, comment_type, content, created_at)
     VALUES ($1, $2, $3::comment_type, $4, LOCALTIMESTAMP)
     RETURNING comment_id, content, created_at`,
    [requestId, userId, commentType, content]
  );
  await query(`UPDATE service_requests SET updated_at = LOCALTIMESTAMP WHERE request_id = $1`, [
    requestId,
  ]);
  return result.rows[0];
};

exports.findByCreatorId = async (userId) => {
  const sql = `${requestsSelect()}
    WHERE r.created_by = $1
    ORDER BY r.created_at DESC`;
  const result = await query(sql, [userId]);
  return result.rows.map(mapRowToRequest);
};

exports.findById = async (id, requesterId, staffId, managerId) => {
  const requesterFilter = requesterId ? 'AND r.requester_id = $2' : '';
  const contactCondition = staffId
    ? 'r.contact_information_approved = true AND r.assigned_staff_id = $2'
    : null;
  let sql = `${requestsSelect(contactCondition)} WHERE r.request_id = $1 ${requesterFilter}`;
  if (staffId) sql += ` AND ${staffMembership}`;
  if (managerId)
    sql += ` AND d.manager_id = $2 AND d.is_active = true AND EXISTS (
    SELECT 1 FROM users manager WHERE manager.user_id = $2 AND manager.user_type = 'MANAGER' AND manager.is_active = true)`;
  const actorId = requesterId || staffId || managerId;
  const params = actorId ? [id, actorId] : [id];
  const result = await query(sql, params);
  if (result.rows.length === 0) {
    if (staffId) requireStaffAccess(await exports.findAccessContext(id, staffId), staffId);
    return null;
  }
  const request = mapRowToRequest(result.rows[0]);
  if (staffId) {
    const row = result.rows[0];
    requireStaffAccess(row, staffId);
    request.canViewContact =
      row.contact_information_approved === true && row.assigned_staff_id === staffId;
    request.canManageStatus = row.assigned_staff_id === staffId;
    request.canAssign = !row.assigned_staff_id && request.status === 'Submitted';
    request.contactAccessStatus = row.contact_access_status || null;
    if (!request.canViewContact) {
      request.requesterName = 'Restricted';
      request.requesterEmail = '';
      request.requesterPhone = '';
    }
  }

  // Fetch comments
  const commentsSql = `
    SELECT 
      rc.comment_id, rc.content, rc.created_at, 
      ${staffId ? "CASE WHEN u.user_type = 'REQUESTER' THEN 'Restricted' ELSE u.first_name || ' ' || u.last_name END" : "u.first_name || ' ' || u.last_name"} as author_name,
      u.user_type
    FROM request_comments rc
    LEFT JOIN users u ON rc.commented_by = u.user_id
    WHERE rc.request_id = $1 AND rc.is_deleted IS NOT TRUE
    ORDER BY rc.created_at ASC
  `;

  // Fetch timeline
  const historySql = `
    SELECT 
      h.status_history_id, h.new_status, h.changed_at,
      ${staffId ? "CASE WHEN u.user_type = 'REQUESTER' THEN 'Restricted' ELSE u.first_name || ' ' || u.last_name END" : "u.first_name || ' ' || u.last_name"} as actor_name
    FROM request_status_history h
    LEFT JOIN users u ON h.changed_by = u.user_id
    WHERE h.request_id = $1
    ORDER BY h.changed_at ASC
  `;
  const [commentsResult, historyResult] = await Promise.all([
    query(commentsSql, [id]),
    query(historySql, [id]),
  ]);
  request.comments = commentsResult.rows.map((row) => ({
    id: row.comment_id,
    author: row.author_name || 'System',
    authorRole: toTitleCase(row.user_type || 'Staff'),
    text: row.content,
    timestamp: formatDate(row.created_at),
  }));
  request.timeline = historyResult.rows.map((row) => ({
    id: row.status_history_id,
    status: toTitleCase(row.new_status),
    label: `Status changed to ${toTitleCase(row.new_status)}`,
    timestamp: formatDate(row.changed_at),
    actor: row.actor_name || 'System',
  }));

  return request;
};

exports.updateStatus = async (id, newStatus, comment, userId = null, staffOnly = false) => {
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
    if (staffOnly) {
      requireStaffAccess(await exports.findAccessContext(id, userId, client), userId, true);
      if (!(ALLOWED_TRANSITIONS[toTitleCase(oldDbStatus)] || []).includes(newStatus)) {
        throw new Error(`Invalid transition from ${toTitleCase(oldDbStatus)} to ${newStatus}`);
      }
    }

    // Concurrency / idempotency guard: reject duplicate transition if already at target status
    if (oldDbStatus === dbStatus) {
      throw new Error(`Request is already ${toTitleCase(oldDbStatus)}`);
    }

    // Use the database clock for every timestamp in this transaction. Passing
    // a JS Date into timestamp-without-time-zone columns stored local wall time.
    await client.query(
      `UPDATE service_requests
       SET status = $1::request_status, updated_at = LOCALTIMESTAMP,
           resolved_at = CASE
             WHEN $1::request_status = 'RESOLVED' THEN LOCALTIMESTAMP
             WHEN $1::request_status = 'IN_PROGRESS' THEN NULL
             ELSE resolved_at END,
           closed_at = CASE WHEN $1::request_status = 'CLOSED' THEN LOCALTIMESTAMP ELSE NULL END,
           overdue_flag = CASE
             WHEN $1::request_status IN ('RESOLVED', 'CLOSED', 'REJECTED') THEN false
             ELSE overdue_flag END
       WHERE request_id = $2`,
      [dbStatus, id]
    );

    // Use authenticated userId or fallback to staff user lookup
    let actorUserId = userId;
    if (!actorUserId) {
      const userRes = await client.query(
        "SELECT user_id FROM users WHERE user_type IN ('STAFF', 'MANAGER', 'ADMIN') LIMIT 1"
      );
      if (userRes.rows.length > 0) {
        actorUserId = userRes.rows[0].user_id;
      }
    }

    // Insert into status history if it changed
    if (oldDbStatus !== dbStatus && actorUserId) {
      await client.query(
        'INSERT INTO request_status_history (request_id, old_status, new_status, changed_by, changed_at) VALUES ($1, $2, $3, $4, LOCALTIMESTAMP)',
        [id, oldDbStatus, dbStatus, actorUserId]
      );
    }

    // If there's a comment
    if (comment && actorUserId) {
      await client.query(
        'INSERT INTO request_comments (request_id, commented_by, content, created_at) VALUES ($1, $2, $3, LOCALTIMESTAMP)',
        [id, actorUserId, comment]
      );
    }

    await client.query('COMMIT');

    return exports.findById(id, undefined, staffOnly ? userId : undefined);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Searches, filters, and sorts requests scoped by staff department (FR-203 & FR-207).
 *
 * Contact details are never selected here: the list projection uses the same
 * restricted contact condition as findForStaff (FR-205 / FR-305).
 *
 * @param {object} params
 * @param {string} [params.staffUserId] - UUID of the staff user
 * @param {string} [params.departmentId] - UUID of the department (optional filter)
 * @param {string} [params.q] - Search query (title, reference, description, location)
 * @param {string} [params.status] - Status filter (All, Submitted, Assigned, In Progress, Resolved, Closed, Rejected)
 * @param {string} [params.category] - Category ID or name filter
 * @param {string} [params.priority] - Priority filter (All, Low, Medium, High, Urgent)
 * @param {string} [params.sort] - Sort criteria (date, date_asc, priority, status)
 * @param {string} [params.tab] - Tab filter (all, available, mine, overdue, resolved)
 * @returns {Promise<Array>} Array of mapped request objects
 */
exports.searchStaffRequests = async ({
  staffUserId,
  departmentId = null,
  q = '',
  status = 'All',
  category = 'All',
  priority = 'All',
  sort = 'date',
  tab = 'all',
} = {}) => {
  // Fail closed: with no staff member and no department there is nothing to scope by.
  if (!staffUserId && !departmentId) return [];

  const conditions = [];
  const params = [];

  // Department scoping (FR-207)
  if (departmentId) {
    params.push(departmentId);
    conditions.push(`c.department_id = $${params.length}`);
  }

  // Active department membership (FR-205): staff only see departments they belong to.
  if (staffUserId) {
    params.push(staffUserId);
    const membershipParam = `$${params.length}`;
    conditions.push(staffMembership.replace('$2', () => membershipParam));
  }

  // Text search on title, request_number, description, location (FR-203)
  if (q && q.trim()) {
    params.push(`%${q.trim()}%`);
    const p = params.length;
    conditions.push(
      `(r.title ILIKE $${p} OR r.request_number ILIKE $${p} OR r.description ILIKE $${p} OR r.location ILIKE $${p})`
    );
  }

  // Status filter (FR-203)
  if (status && status !== 'All') {
    const dbStatus = status.toUpperCase().replace(' ', '_');
    params.push(dbStatus);
    conditions.push(`r.status::text = $${params.length}`);
  }

  // Category filter (FR-203)
  if (category && category !== 'All') {
    params.push(category);
    const p = params.length;
    conditions.push(`(c.category_id::text = $${p} OR c.name ILIKE $${p})`);
  }

  // Priority filter (FR-203)
  if (priority && priority !== 'All') {
    const dbPriority = priority.toUpperCase();
    params.push(dbPriority);
    conditions.push(`r.priority::text = $${params.length}`);
  }

  // Tab filtering (FR-203)
  if (tab === 'available') {
    conditions.push(
      `(r.status = 'SUBMITTED' OR (r.status = 'ASSIGNED' AND r.assigned_staff_id IS NULL))`
    );
  } else if (tab === 'mine' && staffUserId) {
    params.push(staffUserId);
    conditions.push(`r.assigned_staff_id = $${params.length}`);
  } else if (tab === 'overdue') {
    conditions.push(`r.overdue_flag = true`);
  } else if (tab === 'resolved') {
    conditions.push(`r.status = 'RESOLVED'`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Sort ordering (FR-203)
  let orderBy = 'r.created_at DESC';
  if (sort === 'date_asc') {
    orderBy = 'r.created_at ASC';
  } else if (sort === 'priority') {
    orderBy = `CASE r.priority::text
      WHEN 'URGENT' THEN 1
      WHEN 'HIGH' THEN 2
      WHEN 'MEDIUM' THEN 3
      WHEN 'LOW' THEN 4
      ELSE 5 END ASC, r.created_at DESC`;
  } else if (sort === 'status') {
    orderBy = 'r.status::text ASC, r.created_at DESC';
  }

  // 'false' keeps requester contact columns NULL in SQL, as in findForStaff.
  const sql = `${requestsSelect('false')} ${whereClause} ORDER BY ${orderBy}`;
  const result = await query(sql, params);
  return result.rows.map((row) => ({ ...mapRowToRequest(row), requesterName: 'Restricted' }));
};

/**
 * Lists active categories belonging to a specific department.
 * @param {string} departmentId
 * @returns {Promise<Array>}
 */
exports.findCategoriesByDepartment = async (departmentId) => {
  if (!departmentId) return exports.findCategories();
  const result = await query(
    'SELECT category_id AS id, name, description FROM request_categories WHERE department_id = $1 AND is_active = true ORDER BY name ASC',
    [departmentId]
  );
  return result.rows;
};
