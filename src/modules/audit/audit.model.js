exports.recordContactAccessChange = async (client, { actorId, requestId, action, details }) => {
  await client.query(
    `INSERT INTO admin_audit_log (admin_id, action_type, target_type, target_id, changed_data, created_at)
     VALUES ($1, $2::action_type, 'REQUEST', $3, $4::json, LOCALTIMESTAMP)`,
    [actorId, action, requestId, JSON.stringify(details)]
  );
};
