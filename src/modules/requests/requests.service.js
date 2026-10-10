const requestsModel = require('./requests.model');
const { REQUEST_STATUSES, ALLOWED_TRANSITIONS } = require('./requests.constants');
const EventEmitter = require('events');

class RequestWorkflowService extends EventEmitter {
  constructor() {
    super();
  }

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

exports.list = async () => await requestsModel.findAll();
exports.getById = async (id) => await requestsModel.findById(id);
exports.workflow = workflowService;
