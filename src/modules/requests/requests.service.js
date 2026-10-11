const requestsModel = require('./requests.model');
const { REQUEST_STATUSES, ALLOWED_TRANSITIONS } = require('./requests.constants');
const { validateSubmission, validateExternalRequester, isUuid } = require('./requests.schema');
const eventBus = require('../../shared/events/eventBus');
const { RequestAccessError, requireStaffAccess } = require('./requests.access');

class RequestValidationError extends Error {
  constructor(errors) {
    super('Please correct the request details.');
    this.name = 'RequestValidationError';
    this.errors = errors;
  }
}

class SubmissionUserNotFoundError extends Error {
  constructor() {
    super('No active database user is available for this action.');
    this.name = 'SubmissionUserNotFoundError';
  }
}

const generateRequestNumber = (year, sequence) => `CC-${year}-${String(sequence).padStart(4, '0')}`;

const createServiceRequest = async ({ input, actorType, actorUserId }) => {
  const submission = validateSubmission(input);
  const errors = { ...submission.errors };
  let externalRequester = null;

  if (actorType === 'OPERATOR') {
    const externalRequesterId =
      typeof input.externalRequesterId === 'string' ? input.externalRequesterId.trim() : '';
    if (externalRequesterId) {
      if (!isUuid(externalRequesterId)) {
        throw new RequestValidationError({
          externalRequesterId: 'Please select a valid community member.',
        });
      }
      externalRequester = await requestsModel.findExternalRequesterById(externalRequesterId);
      if (!externalRequester) {
        throw new RequestValidationError({
          externalRequesterId: 'Please select an existing community member or enter new details.',
        });
      }
    } else {
      const external = validateExternalRequester(input);
      Object.assign(errors, external.errors);
      externalRequester = external.value;
    }
  } else if (actorType !== 'REQUESTER') {
    throw new Error(`Unsupported request creator type: ${actorType}`);
  }

  if (Object.keys(errors).length > 0) {
    throw new RequestValidationError(errors);
  }

  const category = await requestsModel.findActiveCategory(submission.value.categoryId);
  if (!category) {
    throw new RequestValidationError({
      categoryId: 'Please select an available category.',
    });
  }

  const actorId = actorUserId;
  if (!actorId) {
    throw new SubmissionUserNotFoundError();
  }

  const created = await requestsModel.create(
    {
      ...submission.value,
      requesterId: actorType === 'REQUESTER' ? actorId : null,
      externalRequesterId:
        actorType === 'OPERATOR' && input.externalRequesterId
          ? input.externalRequesterId.trim()
          : null,
      externalRequester: actorType === 'OPERATOR' ? externalRequester : null,
      createdBy: actorId,
    },
    generateRequestNumber
  );

  return {
    ...created,
    reference: created.reference || created.request_number,
  };
};

class RequestWorkflowService {
  async transitionRequest(requestId, newStatus, userId, comment = null, staffOnly = false) {
    let staffContext;
    if (staffOnly) {
      if (!isUuid(requestId) || !isUuid(userId)) {
        throw new RequestAccessError('Invalid request or staff identifier.', 400);
      }
      staffContext = await requestsModel.findAccessContext(requestId, userId);
      requireStaffAccess(staffContext, userId, true);
    }
    const request = staffOnly
      ? { status: staffContext.status }
      : await requestsModel.findById(requestId);
    if (!request) {
      throw new Error('Request not found');
    }

    const currentStatus = request.status || REQUEST_STATUSES.SUBMITTED;

    // Validate transition
    const validNextStates = ALLOWED_TRANSITIONS[currentStatus] || [];
    if (!validNextStates.includes(newStatus)) {
      throw new Error(`Invalid transition from ${currentStatus} to ${newStatus}`);
    }

    // FR-204 and FR-206 resolution requires a comment
    if (newStatus === REQUEST_STATUSES.RESOLVED && !comment) {
      throw new Error('A resolution comment is required to resolve a request.');
    }

    // Update state in real implementation this needs to be a DB transaction
    const oldStatus = currentStatus;
    const updatedRequest = staffOnly
      ? await requestsModel.updateStatus(requestId, newStatus, comment, userId, true)
      : await requestsModel.updateStatus(requestId, newStatus, comment, userId);

    // Fire side effects asynchronously (FR-104 email, FR-302 audit log)
    eventBus.emit('RequestStatusChanged', {
      requestId,
      oldStatus,
      newStatus,
      userId,
      comment,
      timestamp: new Date(),
    });

    return updatedRequest;
  }
}

const workflowService = new RequestWorkflowService();

exports.list = async () => await requestsModel.findAll();
exports.listForStaff = async (staffId) => {
  if (!isUuid(staffId)) throw new RequestAccessError('Invalid staff identifier.', 403);
  return requestsModel.findForStaff(staffId);
};
// Workflow reuses this policy while holding its own transaction lock.
exports.checkStaffAccess = async (id, staffId, client) => {
  if (!isUuid(id) || !isUuid(staffId)) {
    throw new RequestAccessError('Invalid request or staff identifier.', 400);
  }
  const context = await requestsModel.findAccessContext(id, staffId, client);
  requireStaffAccess(context, staffId);
  return context;
};
exports.getForStaff = async (id, staffId) => {
  if (!isUuid(id)) throw new RequestAccessError('Invalid request identifier.', 400);
  if (!isUuid(staffId)) throw new RequestAccessError('Invalid staff identifier.', 403);
  return requestsModel.findById(id, undefined, staffId);
};
exports.listForManager = async (managerId, input = {}) => {
  if (!managerId) return null;
  const filters = {};
  for (const field of ['status', 'category', 'q']) {
    if (input[field] !== undefined && typeof input[field] !== 'string') {
      throw new RequestValidationError({ [field]: 'Please provide a single filter value.' });
    }
    filters[field] = (input[field] || '').trim();
    if (filters[field].length > (field === 'q' ? 200 : 50)) {
      throw new RequestValidationError({ [field]: 'The filter value is too long.' });
    }
  }
  const data = await requestsModel.findForManager(managerId, filters);
  if (!data) return null;
  if (filters.status && !data.statuses.some((option) => option.value === filters.status)) {
    throw new RequestValidationError({ status: 'Please select a valid status.' });
  }
  if (filters.category && !data.categories.some((option) => option.id === filters.category)) {
    throw new RequestValidationError({ category: 'Please select a category in your department.' });
  }
  return { ...data, filters };
};
exports.listCategories = async () => await requestsModel.findCategories();
exports.listForRequester = async (requesterId) => {
  if (!requesterId) {
    throw new SubmissionUserNotFoundError();
  }
  return requestsModel.findByRequesterId(requesterId);
};
exports.listCreatedByOperator = async (operatorId) => {
  if (!operatorId) {
    throw new SubmissionUserNotFoundError();
  }
  return requestsModel.findByCreatorId(operatorId);
};
exports.searchExternalRequesters = async (searchTerm) =>
  requestsModel.searchExternalRequesters(searchTerm);
exports.submit = async (input, requesterId) =>
  createServiceRequest({
    input,
    actorType: 'REQUESTER',
    actorUserId: requesterId,
  });
exports.createServiceRequest = createServiceRequest;
exports.generateRequestNumber = generateRequestNumber;
exports.RequestValidationError = RequestValidationError;
exports.SubmissionUserNotFoundError = SubmissionUserNotFoundError;
exports.getById = async (id) => await requestsModel.findById(id);
exports.getForRequester = async (id, requesterId) => {
  if (!requesterId) {
    throw new SubmissionUserNotFoundError();
  }
  return requestsModel.findById(id, requesterId);
};
exports.workflow = workflowService;
