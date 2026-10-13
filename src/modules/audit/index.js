const auditModel = require('./audit.model');
const { register } = require('./audit.listener');

let unregister;

const initialize = () => {
  if (!unregister) {
    const removeListeners = register();
    unregister = () => {
      removeListeners();
      unregister = null;
    };
  }
  return unregister;
};

module.exports = {
  initialize,
  recordContactAccessChange: auditModel.recordContactAccessChange,
  recordStatusChange: auditModel.recordStatusChange,
  recordAssignment: auditModel.recordAssignment,
  recordAdminUserEvent: auditModel.recordAdminUserEvent,
  getAuditLogForRequest: auditModel.getAuditLogForRequest,
  getAuditLog: auditModel.getAuditLog,
  getAuditLogCount: auditModel.getAuditLogCount,
  recordAuditEntry: auditModel.recordAuditEntry,
};
