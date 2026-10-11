/**
 * Workflow assignment business rules (FR-201).
 */
const { validateStaffDepartment } = require('./workflow.model');

/**
 * Checks whether the staff member is permitted to accept responsibility for this request.
 * Enforces department-level security (NFR-101) so staff cannot accept tickets
 * belonging to other municipal departments.
 *
 * @param {string} requestId
 * @param {string} staffUserId
 * @returns {Promise<{ allowed: boolean, reason?: string }>}
 */
exports.canAssignToSelf = async (requestId, staffUserId) => {
  if (!requestId) {
    return { allowed: false, reason: 'Request ID is required' };
  }
  if (!staffUserId) {
    return { allowed: false, reason: 'Staff User ID is required' };
  }

  const validation = await validateStaffDepartment(requestId, staffUserId);
  if (!validation.allowed) {
    return { allowed: false, reason: validation.reason };
  }

  // Ensure request is not already resolved, closed, or rejected
  const terminalStatuses = ['RESOLVED', 'CLOSED', 'REJECTED'];
  if (terminalStatuses.includes(validation.currentStatus)) {
    return {
      allowed: false,
      reason: `Cannot assign request in terminal status '${validation.currentStatus}'.`,
    };
  }

  return { allowed: true };
};
