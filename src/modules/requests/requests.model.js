const { pool } = require('../../config/database');
const { mockRequests } = require('../../../db/mock/mockData');

const DISPLAY_STATUSES = {
  SUBMITTED: 'Submitted',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REJECTED: 'Rejected',
};

const mapRequest = (row) => ({
  id: row.request_id,
  reference: row.request_number,
  category: row.category_name,
  title: row.title,
  description: row.description,
  location: row.location,
  status: DISPLAY_STATUSES[row.status] || row.status,
  priority: row.priority ? row.priority.charAt(0) + row.priority.slice(1).toLowerCase() : 'Medium',
  submittedAt:
    row.created_at instanceof Date
      ? row.created_at.toISOString().slice(0, 16).replace('T', ' ')
      : row.created_at,
  overdue: false,
  comments: [],
});

exports.findAll = () => mockRequests;
exports.findById = (id) => mockRequests.find((request) => request.id === id);

exports.updateStatus = (id, newStatus, comment) => {
  const request = mockRequests.find((item) => item.id === id);
  if (request) {
    request.status = newStatus;
    const now = new Date();
    const formattedDate = now.toISOString().slice(0, 16).replace('T', ' ');
    request.updatedAt = formattedDate;

    if (comment) {
      if (!request.comments) request.comments = [];
      request.comments.push({
        id: `c_new_${Date.now()}`,
        author: 'Current User',
        authorRole: 'Staff',
        text: comment,
        timestamp: formattedDate,
      });
    }
  }
  return request;
};

exports.findCategories = async () => {
  const result = await pool.query(
    `SELECT category_id, name
     FROM request_categories
     WHERE is_active = true
     ORDER BY display_order, name`
  );

  return result.rows.map((row) => ({ id: row.category_id, name: row.name }));
};

exports.findActiveCategory = async (categoryId) => {
  const result = await pool.query(
    `SELECT category_id, name
     FROM request_categories
     WHERE category_id = $1 AND is_active = true`,
    [categoryId]
  );

  const category = result.rows[0];
  return category ? { id: category.category_id, name: category.name } : null;
};

exports.findRequesterIdByEmail = async (email) => {
  const result = await pool.query(
    `SELECT user_id
     FROM users
     WHERE email = $1 AND user_type = 'REQUESTER' AND is_active = true`,
    [email]
  );

  return result.rows[0]?.user_id || null;
};

exports.create = async (request, generateRequestNumber) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query('BEGIN');
    transactionStarted = true;

    const year = new Date().getFullYear();
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`CC-${year}`]);

    const latestResult = await client.query(
      `SELECT COALESCE(MAX(substring(request_number FROM 9)::integer), 0) AS sequence
       FROM service_requests
       WHERE request_number ~ $1`,
      [`^CC-${year}-[0-9]+$`]
    );
    const requestNumber = generateRequestNumber(year, Number(latestResult.rows[0].sequence) + 1);

    const result = await client.query(
      `INSERT INTO service_requests
         (request_number, requester_id, category_id, title, description, location, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'SUBMITTED')
       RETURNING request_id, request_number, category_id, title, description, location,
                 status, priority, created_at`,
      [
        requestNumber,
        request.requesterId,
        request.categoryId,
        request.title,
        request.description,
        request.location,
      ]
    );

    await client.query('COMMIT');
    transactionStarted = false;
    return result.rows[0];
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
      }
    }
    throw error;
  } finally {
    client.release();
  }
};

exports.findByRequesterEmail = async (email) => {
  const result = await pool.query(
    `SELECT sr.request_id, sr.request_number, rc.name AS category_name,
            sr.title, sr.description, sr.location, sr.status, sr.priority, sr.created_at
     FROM service_requests sr
     JOIN request_categories rc ON rc.category_id = sr.category_id
     JOIN users u ON u.user_id = sr.requester_id
     WHERE u.email = $1 AND u.user_type = 'REQUESTER' AND u.is_active = true
     ORDER BY sr.created_at DESC`,
    [email]
  );

  return result.rows.map(mapRequest);
};
