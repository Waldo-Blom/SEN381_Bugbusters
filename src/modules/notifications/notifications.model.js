const { query } = require('../../config/database');

exports.findRequestStatusDetails = async (requestId, staffUserId) => {
  const result = await query(
    `SELECT
      r.request_id,
      r.title AS request_name,
      u.user_id,
      COALESCE(
        NULLIF(concat_ws(' ', NULLIF(u.first_name, ''), NULLIF(u.last_name, '')), ''),
        NULLIF(concat_ws(' ', NULLIF(ext.first_name, ''), NULLIF(ext.last_name, '')), ''),
        'Requester'
      ) AS requester_name,
      COALESCE(u.email, ext.email) AS recipient_email,
      COALESCE(u.email_notifications_enabled, true) AS email_notifications_enabled,
      r.request_number AS request_reference,
      d.name AS department,
      NULLIF(concat_ws(' ', NULLIF(staff.first_name, ''), NULLIF(staff.last_name, '')), '') AS staff_name
    FROM service_requests r
    LEFT JOIN users u ON r.requester_id = u.user_id
    LEFT JOIN external_requesters ext ON r.external_requester_id = ext.external_requester_id
    LEFT JOIN request_categories c ON r.category_id = c.category_id
    LEFT JOIN departments d ON c.department_id = d.department_id
    LEFT JOIN users staff ON staff.user_id = $2
    WHERE r.request_id = $1`,
    [requestId, staffUserId || null]
  );
  const row = result.rows[0];
  if (!row) return null;

  return {
    requestId: row.request_id,
    requestName: row.request_name,
    userId: row.user_id,
    requesterName: row.requester_name,
    recipientEmail: row.recipient_email,
    emailNotificationsEnabled: row.email_notifications_enabled,
    requestReference: row.request_reference,
    department: row.department,
    staffName: row.staff_name,
  };
};
