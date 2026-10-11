const requestsModel = require('./requests.model');
const { REQUEST_STATUSES, ALLOWED_TRANSITIONS } = require('./requests.constants');
const { validateSubmission, validateExternalRequester, isUuid } = require('./requests.schema');
const eventBus = require('../../shared/events/eventBus');

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
  async transitionRequest(requestId, newStatus, userId, comment = null) {
    const request = await requestsModel.findById(requestId);
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
    const updatedRequest = await requestsModel.updateStatus(requestId, newStatus, comment);

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
