const { requestsService } = require('../requests');
const reportingModel = require('./reporting.model');

exports.getDashboardData = async () => ({ requests: await requestsService.list() });
exports.getAuditLog = () => reportingModel.getAuditLog();
