const { query } = require('../../config/database');

// Use current database identities and department membership, never a submitted actor ID.
exports.findAccess = async (requestId, userId, client = { query }, lock = false, role = null) => {
  const result = await client.query(
    `SELECT r.request_id, r.requester_id, r.created_by,
       (viewer.is_active AND (
         (viewer.user_type = 'REQUESTER' AND ($3::text IS NULL OR $3 = 'requester') AND r.requester_id = viewer.user_id) OR
         (viewer.user_type::text IN ('OPERATOR', 'STAFF', 'ADMIN') AND $3 = 'operator'
           AND r.external_requester_id IS NOT NULL AND r.created_by = viewer.user_id) OR
         (viewer.user_type = 'MANAGER' AND ($3::text IS NULL OR $3 = 'management') AND d.is_active AND d.manager_id = viewer.user_id) OR
         (viewer.user_type = 'STAFF' AND ($3::text IS NULL OR $3 = 'staff') AND d.is_active AND EXISTS (
           SELECT 1 FROM staff_assignments sa WHERE sa.staff_id = viewer.user_id
             AND sa.department_id = d.department_id AND sa.is_active = true))
       )) AS allowed,
       (viewer.is_active AND (
         (viewer.user_type = 'REQUESTER' AND ($3::text IS NULL OR $3 = 'requester') AND r.requester_id = viewer.user_id) OR
         (viewer.user_type::text IN ('OPERATOR', 'STAFF', 'ADMIN') AND $3 = 'operator'
           AND r.external_requester_id IS NOT NULL AND r.created_by = viewer.user_id)
       )) AS can_upload
     FROM service_requests r
     JOIN request_categories c ON c.category_id = r.category_id
     JOIN departments d ON d.department_id = c.department_id
     LEFT JOIN users viewer ON viewer.user_id = $2
     WHERE r.request_id = $1 ${lock ? 'FOR UPDATE OF r' : ''}`,
    [requestId, userId, role]
  );
  return result.rows[0] || null;
};
exports.count = async (client, requestId) => {
  const result = await client.query(
    'SELECT COUNT(*)::int AS count FROM request_attachments WHERE request_id = $1',
    [requestId]
  );
  return Number(result.rows[0].count);
};
exports.insert = async (client, requestId, userId, image, key) => {
  const result = await client.query(
    `INSERT INTO request_attachments
      (request_id, file_name, file_path, file_size_bytes, file_extension_type, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING attachment_id`,
    [requestId, image.fileName, key, image.size, image.extension, userId]
  );
  return result.rows[0];
};
exports.list = async (requestId) => {
  const result = await query(
    `SELECT attachment_id AS id, file_name AS name, file_size_bytes AS size,
      file_extension_type AS extension FROM request_attachments
     WHERE request_id = $1 ORDER BY uploaded_at, attachment_id`,
    [requestId]
  );
  return result.rows;
};
exports.find = async (requestId, attachmentId) => {
  const result = await query(
    `SELECT file_path, file_extension_type FROM request_attachments
     WHERE request_id = $1 AND attachment_id = $2`,
    [requestId, attachmentId]
  );
  return result.rows[0] || null;
};
exports.deleteByIds = async (client, requestId, attachmentIds) => {
  if (!attachmentIds || !attachmentIds.length) return [];
  const result = await client.query(
    `DELETE FROM request_attachments
     WHERE request_id = $1 AND attachment_id = ANY($2::uuid[])
     RETURNING attachment_id AS id, file_path`,
    [requestId, attachmentIds]
  );
  return result.rows;
};
