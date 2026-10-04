const { requestsService } = require('../requests');
const reportingModel = require('./reporting.model');

exports.getDashboardData = () => ({ requests: requestsService.list() });
exports.getAuditLog = () => reportingModel.getAuditLog();
