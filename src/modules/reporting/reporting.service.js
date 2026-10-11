const reportingModel = require('./reporting.model');

const displayEnum = (value) =>
  (value || '')
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

exports.getDashboardData = async (managerId) => {
  const department = await reportingModel.findManagedDepartment(managerId);
  if (!department) return null;

  const [rows, stats] = await Promise.all([
    reportingModel.findDashboardRequests(managerId, department.id),
    reportingModel.findDashboardStats(managerId, department.id),
  ]);
  const open = Number(stats.open);
  const resolved = Number(stats.resolved);
  const closed = Number(stats.closed);
  const eligibleTotal = Number(stats.eligible_total);
  const slaTotal = Number(stats.sla_total);
  return {
    department,
    stats: {
      open,
      overdue: Number(stats.overdue),
      resolved,
      closed,
      avgResponseHours:
        stats.avg_response_hours == null ? null : Number(stats.avg_response_hours).toFixed(1),
      resolutionRate: eligibleTotal
        ? (((resolved + closed) / eligibleTotal) * 100).toFixed(1)
        : null,
      slaCompliance: slaTotal ? ((Number(stats.sla_met) / slaTotal) * 100).toFixed(1) : null,
      slaTotal,
    },
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
