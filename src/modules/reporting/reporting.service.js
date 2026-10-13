const reportingModel = require('./reporting.model');

const displayEnum = (value) =>
  (value || '')
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

const activityLabel = (row) => {
  switch (row.event_type) {
    case 'submission':
      return 'Request submitted';
    case 'status':
      return `Status changed to ${displayEnum(row.event_status)}`;
    case 'assignment':
      return row.assignee ? `Assigned to ${row.assignee}` : 'Assignment removed';
    case 'comment':
      return `${displayEnum(row.comment_type || 'NOTE')} comment added`;
    default:
      return 'Request activity';
  }
};

exports.getDashboardData = async (managerId) => {
  const department = await reportingModel.findManagedDepartment(managerId);
  if (!department) return null;

  const [rows, stats] = await Promise.all([
    reportingModel.findRecentActivity(managerId, department.id),
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
    recentActivity: rows.map((row) => ({
      id: row.id,
      reference: row.reference,
      title: row.title,
      category: row.category,
      status: displayEnum(row.status),
      priority: displayEnum(row.priority),
      label: activityLabel(row),
      actor: row.actor || 'Unknown user',
      timestamp: row.timestamp,
    })),
  };
};

const auditActionLabel = (actionType) => {
  const labels = {
    REQUEST_SUBMITTED: 'Request submitted',
    STATUS_CHANGED: 'Status changed',
    REQUEST_ASSIGNED: 'Assignment changed',
    CONTACT_ACCESS_REQUESTED: 'Contact access requested',
    CONTACT_ACCESS_APPROVED: 'Contact access approved',
    CONTACT_ACCESS_REJECTED: 'Contact access rejected',
    CONTACT_ACCESS_REVOKED: 'Contact access revoked',
    USER_CREATED: 'Staff account created',
    USER_MODIFIED: 'Staff account updated',
    USER_DEACTIVATED: 'Staff account deactivated',
    STAFF_ASSIGNED: 'Staff assigned',
    STAFF_REMOVED: 'Staff removed',
  };
  return labels[actionType] || displayEnum(actionType);
};

const auditDetail = (entry) => {
  const changedData = entry.changed_data || {};
  if (entry.action_type === 'STATUS_CHANGED') {
    return `Status changed from ${displayEnum(changedData.oldStatus)} to ${displayEnum(changedData.newStatus)}`;
  }
  if (entry.action_type === 'REQUEST_ASSIGNED') {
    return entry.assignee_name ? `Assigned to ${entry.assignee_name}` : 'Assignment removed';
  }
  if (entry.action_type === 'REQUEST_SUBMITTED') {
    return 'Request entered the system';
  }
  if (entry.action_type === 'USER_CREATED') {
    return `Created an account for ${entry.subject_name || 'a staff member'}`;
  }
  if (entry.action_type === 'USER_MODIFIED' && changedData.isActive === true) {
    return `Re-enabled ${entry.subject_name || 'a staff member'}`;
  }
  if (entry.action_type === 'USER_DEACTIVATED') {
    return `Deactivated ${entry.subject_name || 'a staff member'}`;
  }
  if (entry.action_type === 'STAFF_ASSIGNED') {
    return `${changedData.reactivated ? 'Re-enabled' : 'Assigned'} ${entry.subject_name || 'a staff member'} to this department`;
  }
  if (entry.action_type === 'STAFF_REMOVED') {
    return `Removed ${entry.subject_name || 'a staff member'} from this department`;
  }
  if (entry.action_type.startsWith('CONTACT_ACCESS_')) {
    return 'Contact access authorization activity';
  }
  return 'Request activity recorded';
};

exports.getAuditLog = async (managerId, departmentId, page = 1) => {
  const pageSize = 100;
  const totalCount = await reportingModel.getAuditLogCount(managerId, departmentId);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(page, totalPages);
  const entries = await reportingModel.getAuditLog(managerId, departmentId, {
    limit: pageSize,
    offset: (currentPage - 1) * pageSize,
  });
  return {
    entries: entries.map((entry) => ({
      action: auditActionLabel(entry.action_type),
      timestamp: entry.timestamp,
      detail: auditDetail(entry),
      actor: entry.actor_name || 'Unknown user',
      reference: entry.request_number || entry.subject_email,
    })),
    totalCount,
    page: currentPage,
    totalPages,
  };
};

exports.getContactAccessInbox = async (managerId) => {
  if (!managerId) return null;
  const department = await reportingModel.findManagedDepartment(managerId);
  if (!department) return null;
  const { requestsService } = require('../requests');
  const contactAccessRequests = await requestsService.contactAccess.listInbox(
    managerId,
    department.id
  );
  return { department, contactAccessRequests, contactAccessRequestsEnabled: true };
};
