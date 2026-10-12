class RequestAccessError extends Error {
  constructor(message, statusCode = 403) {
    super(message);
    this.name = 'RequestAccessError';
    this.statusCode = statusCode;
  }
}

const requireStaffAccess = (context, staffId, assignedOnly = false) => {
  if (!context) throw new RequestAccessError('Request not found.', 404);
  if (!context.staff_allowed || (assignedOnly && context.assigned_staff_id !== staffId)) {
    throw new RequestAccessError('You are not authorised to access this request.');
  }
};

module.exports = { RequestAccessError, requireStaffAccess };
