const requestsModel = require('./requests.model');
const { REQUEST_STATUSES, ALLOWED_TRANSITIONS } = require('./requests.constants');
const { validateSubmission } = require('./requests.schema');
const EventEmitter = require('events');

class RequestValidationError extends Error {
  constructor(errors) {
    super('Please correct the highlighted fields and try again.');
    this.name = 'RequestValidationError';
    this.errors = errors;
  }
}

class RequesterAccountNotFoundError extends Error {
  constructor() {
    super('Your requester account was not found. Please sign in with an active requester account.');
    this.name = 'RequesterAccountNotFoundError';
  }
}

const generateRequestNumber = (year, sequence) => {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) {
    throw new RangeError('The request year must be a four-digit number.');
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new RangeError('The request sequence must be a positive integer.');
  }

  return `CC-${year}-${String(sequence).padStart(4, '0')}`;
};

class RequestWorkflowService extends EventEmitter {
  constructor() {
    super();
  }

  transitionRequest(requestId, newStatus, userId, comment = null) {
    const request = requestsModel.findById(requestId);
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
    const updatedRequest = requestsModel.updateStatus(requestId, newStatus, comment);

    // Fire side effects asynchronously (FR-104 email, FR-302 audit log)
    this.emit('RequestStatusChanged', {
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

// Mock listeners for secondary side-effects (Decoupled per ADR-005)
workflowService.on('RequestStatusChanged', (data) => {
  console.log('[AuditLogService] Status changed:', data);
  // TODO: Insert into request_status_history
});

workflowService.on('RequestStatusChanged', (data) => {
  console.log('[NotificationService] Dispatching email for request:', data.requestId);
  // TODO: emailService.sendStatusUpdate(...)
});

exports.list = () => requestsModel.findAll();
exports.getById = (id) => requestsModel.findById(id) || requestsModel.findAll()[0];
exports.listForRequester = (requesterEmail) => requestsModel.findByRequesterEmail(requesterEmail);
exports.listCategories = () => requestsModel.findCategories();
exports.generateRequestNumber = generateRequestNumber;
exports.RequestValidationError = RequestValidationError;
exports.RequesterAccountNotFoundError = RequesterAccountNotFoundError;

exports.submit = async (requesterEmail, input) => {
  const { errors, value } = validateSubmission(input);
  if (Object.keys(errors).length > 0) {
    throw new RequestValidationError(errors);
  }

  const requesterId = await requestsModel.findRequesterIdByEmail(requesterEmail);
  if (!requesterId) {
    throw new RequesterAccountNotFoundError();
  }

  const category = await requestsModel.findActiveCategory(value.categoryId);
  if (!category) {
    throw new RequestValidationError({
      categoryId: 'Please select an available category.',
    });
  }

  const created = await requestsModel.create({ ...value, requesterId }, generateRequestNumber);

  return {
    id: created.request_id,
    reference: created.request_number,
    status: REQUEST_STATUSES.SUBMITTED,
  };
};
exports.workflow = workflowService;
