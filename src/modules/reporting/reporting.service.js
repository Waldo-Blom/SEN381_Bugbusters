const reportingModel = require('./reporting.model');

const displayEnum = (value) =>
  (value || '')
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

exports.getDashboardData = async (managerId) => {
  const department = await reportingModel.findManagedDepartment(managerId);
  if (!department) return null;

  const rows = await reportingModel.findDashboardRequests(managerId, department.id);
  return {
    department,
    requests: rows.map((row) => ({
      id: row.id,
      reference: row.reference,
      title: row.title,
      category: row.category,
      status: displayEnum(row.status),
      priority: displayEnum(row.priority),
      overdue: row.overdue_flag === true,
      updatedAt: row.updated_at
        ? new Date(row.updated_at).toISOString().slice(0, 16).replace('T', ' ')
        : '',
    })),
  };
};
exports.getAuditLog = () => reportingModel.getAuditLog();
