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

const createServiceRequest = async ({ input, actorType, actorUserId, files = [] }) => {
  const attachments = require('./requests.attachments.service');
  const images = await attachments.prepareImages(files);
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

  const creationInput = {
    ...submission.value,
    requesterId: actorType === 'REQUESTER' ? actorId : null,
    externalRequesterId:
      actorType === 'OPERATOR' && input.externalRequesterId
        ? input.externalRequesterId.trim()
        : null,
    externalRequester: actorType === 'OPERATOR' ? externalRequester : null,
    createdBy: actorId,
  };
  const uploadedKeys = [];
  let created;
  try {
    created = images.length
      ? await requestsModel.create(
          creationInput,
          generateRequestNumber,
          async (client, request) => {
            await attachments.persist(
              client,
              request.request_id,
              actorId,
              images,
              uploadedKeys,
              actorType === 'OPERATOR' ? 'operator' : 'requester'
            );
          }
        )
      : await requestsModel.create(creationInput, generateRequestNumber);
  } catch (error) {
    await attachments.cleanup(uploadedKeys);
    if (images.length && !error.statusCode) {
      throw require('./requests.attachments.errors').failure('request', error);
    }
    throw error;
  }

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
      const requiresAssignment = newStatus !== REQUEST_STATUSES.REJECTED;
      requireStaffAccess(staffContext, userId, requiresAssignment);
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
    eventBus.emitAuditEvent('RequestStatusChanged', {
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
exports.contactAccess = require('./requests.contact-access.service');
exports.getForManager = async (id, managerId) => {
  await exports.contactAccess.getForManager(id, managerId);
  const request = await requestsModel.findById(id, undefined, undefined, managerId);
  if (!request) throw new RequestAccessError('Request not found.', 404);
  return request;
};
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
exports.listForRequester = async (requesterId, filters) => {
  if (!requesterId) {
    throw new SubmissionUserNotFoundError();
  }
  return filters
    ? requestsModel.findByRequesterId(requesterId, filters)
    : requestsModel.findByRequesterId(requesterId);
};
exports.getRequesterSummaryCounts = async (requesterId) => {
  if (!requesterId) {
    throw new SubmissionUserNotFoundError();
  }
  if (typeof requestsModel.getRequesterSummaryCounts === 'function') {
    return requestsModel.getRequesterSummaryCounts(requesterId);
  }
  return null;
};
exports.listCreatedByOperator = async (operatorId) => {
  if (!operatorId) {
    throw new SubmissionUserNotFoundError();
  }
  return requestsModel.findByCreatorId(operatorId);
};
exports.searchExternalRequesters = async (searchTerm) =>
  requestsModel.searchExternalRequesters(searchTerm);
exports.submit = async (input, requesterId, files = []) =>
  createServiceRequest({
    input,
    actorType: 'REQUESTER',
    actorUserId: requesterId,
    files,
  });
class StaffDepartmentAccessError extends Error {
  constructor(message = 'You do not have permission to access requests for this department.') {
    super(message);
    this.name = 'StaffDepartmentAccessError';
    this.statusCode = 403;
  }
}

exports.createServiceRequest = createServiceRequest;
exports.generateRequestNumber = generateRequestNumber;
exports.RequestValidationError = RequestValidationError;
exports.SubmissionUserNotFoundError = SubmissionUserNotFoundError;
exports.StaffDepartmentAccessError = StaffDepartmentAccessError;
exports.getById = async (id) => await requestsModel.findById(id);
exports.getForRequester = async (id, requesterId) => {
  if (!requesterId) {
    throw new SubmissionUserNotFoundError();
  }
  return requestsModel.findById(id, requesterId);
};
exports.getForStaff = async (id, staffUserId) => {
  if (!isUuid(id)) throw new RequestAccessError('Invalid request identifier.', 400);
  if (!isUuid(staffUserId)) throw new RequestAccessError('Invalid staff identifier.', 403);

  const usersService = require('../users/users.service');
  const access = await usersService.verifyStaffRequestAccess(staffUserId, id);
  if (!access.allowed) {
    if (access.reason === 'Request not found.') {
      throw new RequestAccessError('Request not found.', 404);
    }
    throw new StaffDepartmentAccessError(access.reason);
  }
  return requestsModel.findById(id, undefined, staffUserId);
};
exports.addStaffComment = async (requestId, staffUserId, comment) => {
  if (!isUuid(requestId)) throw new RequestAccessError('Invalid request identifier.', 400);
  if (!isUuid(staffUserId)) throw new RequestAccessError('Invalid staff identifier.', 403);

  const usersService = require('../users/users.service');
  const access = await usersService.verifyStaffRequestAccess(staffUserId, requestId);
  if (!access.allowed) {
    if (access.reason === 'Request not found.') {
      throw new RequestAccessError('Request not found.', 404);
    }
    throw new StaffDepartmentAccessError(access.reason);
  }

  return requestsModel.addComment(requestId, staffUserId, comment, 'NOTE');
};
exports.addManagerComment = async (requestId, managerUserId, comment) => {
  if (!isUuid(requestId)) throw new RequestAccessError('Invalid request identifier.', 400);
  if (!isUuid(managerUserId)) throw new RequestAccessError('Invalid manager identifier.', 403);

  const request = await requestsModel.findById(requestId, undefined, undefined, managerUserId);
  if (!request) throw new RequestAccessError('Request not found.', 404);

  return requestsModel.addComment(requestId, managerUserId, comment, 'NOTE');
};
exports.searchStaffRequests = async (params) => requestsModel.searchStaffRequests(params);
exports.listCategoriesByDepartment = async (departmentId) =>
  requestsModel.findCategoriesByDepartment(departmentId);
exports.workflow = workflowService;
