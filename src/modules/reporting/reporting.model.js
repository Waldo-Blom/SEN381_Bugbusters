// Read-only queries. Temporary: mock-backed until the DB is wired.
const { auditLog } = require('../../../db/mock/mockData');

exports.getAuditLog = () => auditLog;
