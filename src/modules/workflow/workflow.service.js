const workflowModel = require('./workflow.model');
const workflowRules = require('./workflow.rules');

class AssignmentAuthorizationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AssignmentAuthorizationError';
  }
}

/**
 * Handles accepting responsibility for a ticket by a staff member (FR-201).
 *
 * @param {string} requestId - UUID of the service request
 * @param {string} staffUserId - UUID of the staff user accepting assignment
 * @returns {Promise<object>} updated assignment outcome
 */
exports.assignToSelf = async (requestId, staffUserId) => {
  const check = await workflowRules.canAssignToSelf(requestId, staffUserId);
  if (!check.allowed) {
    throw new AssignmentAuthorizationError(check.reason);
  }

  return await workflowModel.assignToStaff(requestId, staffUserId);
};

exports.AssignmentAuthorizationError = AssignmentAuthorizationError;
