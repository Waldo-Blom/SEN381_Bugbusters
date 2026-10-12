const eventBus = require('../../shared/events/eventBus');
const auditModel = require('./audit.model');
const { pool } = require('../../config/database');

const writeAuditEntry = async (description, requestId, write) => {
  let client;
  try {
    client = await pool.connect();
    await write(client);
  } catch (error) {
    console.error(
      `[AuditListener] Failed to record ${description}${requestId ? ` for request ${requestId}` : ''}:`,
      error
    );
  } finally {
    if (client) {
      try {
        client.release();
      } catch (error) {
        console.error('[AuditListener] Failed to release audit database client:', error);
      }
    }
  }
};

const handleRequestStatusChanged = async (event = {}) => {
  const { requestId, oldStatus, newStatus, userId } = event || {};
  if (!requestId || !userId || !oldStatus || !newStatus) {
    console.warn('[AuditListener] RequestStatusChanged missing required fields', event);
    return;
  }

  await writeAuditEntry('status change audit', requestId, (client) =>
    auditModel.recordStatusChange(client, {
      actorId: userId,
      requestId,
      oldStatus,
      newStatus,
    })
  );
};

const handleRequestAssigned = async (event = {}) => {
  const { requestId, assignedToStaffId, userId, previousAssignee } = event || {};
  if (!requestId || !userId) {
    console.warn('[AuditListener] RequestAssigned missing required fields', event);
    return;
  }

  await writeAuditEntry('assignment audit', requestId, (client) =>
    auditModel.recordAssignment(client, {
      actorId: userId,
      requestId,
      assignedToStaffId: assignedToStaffId || null,
      previousAssignee,
    })
  );
};

const handleContactAccessAuthorized = async (event = {}) => {
  const { requestId, action, actorId, details } = event || {};
  if (!requestId || !actorId || !action) {
    console.warn('[AuditListener] ContactAccessAuthorized missing required fields', event);
    return;
  }

  await writeAuditEntry('contact access audit', requestId, (client) =>
    auditModel.recordContactAccessChange(client, {
      actorId,
      requestId,
      action,
      details,
    })
  );
};

const handleAdminUserEvent = async (event = {}) => {
  const { actionType, targetType, targetId, actorId, changedData } = event || {};
  if (!actionType || !targetType || !targetId || !actorId) {
    console.warn('[AuditListener] AdminUserEvent missing required fields', event);
    return;
  }

  await writeAuditEntry('admin user event audit', null, (client) =>
    auditModel.recordAdminUserEvent(client, {
      actorId,
      actionType,
      targetType,
      targetId,
      changedData,
    })
  );
};

const register = () => {
  eventBus.on('RequestStatusChanged', handleRequestStatusChanged);
  eventBus.on('RequestAssigned', handleRequestAssigned);
  eventBus.on('ContactAccessAuthorized', handleContactAccessAuthorized);
  eventBus.on('AdminUserEvent', handleAdminUserEvent);
  eventBus.on('ContactAccessRequested', handleContactAccessAuthorized);
  eventBus.on('ContactAccessApproved', handleContactAccessAuthorized);
  eventBus.on('ContactAccessRejected', handleContactAccessAuthorized);
  eventBus.on('ContactAccessRevoked', handleContactAccessAuthorized);

  return () => {
    eventBus.off('RequestStatusChanged', handleRequestStatusChanged);
    eventBus.off('RequestAssigned', handleRequestAssigned);
    eventBus.off('ContactAccessAuthorized', handleContactAccessAuthorized);
    eventBus.off('AdminUserEvent', handleAdminUserEvent);
    eventBus.off('ContactAccessRequested', handleContactAccessAuthorized);
    eventBus.off('ContactAccessApproved', handleContactAccessAuthorized);
    eventBus.off('ContactAccessRejected', handleContactAccessAuthorized);
    eventBus.off('ContactAccessRevoked', handleContactAccessAuthorized);
  };
};

module.exports = {
  register,
  handleRequestStatusChanged,
  handleRequestAssigned,
  handleContactAccessAuthorized,
  handleAdminUserEvent,
};
