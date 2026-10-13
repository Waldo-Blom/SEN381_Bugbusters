const model = require('./requests.contact-access.model');
const { isUuid } = require('./requests.schema');
const { RequestAccessError } = require('./requests.access');
const { formatDate } = require('../../shared/datetime');

const validateIds = (id, actorId) => {
  if (!isUuid(id) || !isUuid(actorId))
    throw new RequestAccessError('Invalid request or user identifier.', 400);
};

exports.requestAccess = async (requestId, staffId, input) => {
  validateIds(requestId, staffId);
  const reason =
    input === undefined
      ? 'Requester contact information is needed to clarify this service request.'
      : input;
  if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 1000) {
    throw new RequestAccessError('Please provide a reason of between 1 and 1000 characters.', 400);
  }
  return model.createRequest(requestId, staffId, reason.trim());
};
exports.reviewAccess = async (accessId, managerId, approved) => {
  validateIds(accessId, managerId);
  if (typeof approved !== 'boolean') throw new RequestAccessError('Invalid review decision.', 400);
  return model.reviewRequest(accessId, managerId, approved);
};
exports.changeApproval = async (requestId, managerId, approved) => {
  validateIds(requestId, managerId);
  if (typeof approved !== 'boolean')
    throw new RequestAccessError('Invalid contact access decision.', 400);
  return model.changeApproval(requestId, managerId, approved);
};
exports.getForManager = async (requestId, managerId) => {
  validateIds(requestId, managerId);
  const context = await model.findContext(requestId, managerId);
  if (!context) throw new RequestAccessError('Request not found.', 404);
  if (!context.manager_allowed)
    throw new RequestAccessError("You do not manage this request's department.");
  return context;
};
exports.listInbox = async (managerId, departmentId) => {
  validateIds(departmentId, managerId);
  const rows = await model.findInbox(managerId, departmentId);
  return rows.map((row) => ({
    id: row.id,
    requestId: row.request_id,
    reference: row.reference,
    title: row.title,
    staffName: row.staff_name,
    reason: row.reason,
    requestedAt: formatDate(row.requested_at),
    status: row.status.charAt(0) + row.status.slice(1).toLowerCase(),
    canReview: row.can_review === true,
  }));
};
