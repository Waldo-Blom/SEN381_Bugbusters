const { sendHttpError } = require('../../shared/middleware/error.middleware');

// Read the full session identity when a controller needs user details for a view.
const getAuthenticatedUser = (req) => req.session?.user || null;

// Pass this ID to services/models for database reads or writes that belong to
// the signed-in user, e.g. listForRequester(getAuthenticatedUserId(req)).
const getAuthenticatedUserId = (req) => {
  const user = getAuthenticatedUser(req);
  return typeof user?.id === 'string' && user.id.length > 0 ? user.id : null;
};

// Use this when code needs to make a role-specific decision without trusting
// a role supplied in request parameters or form data.
const getAuthenticatedUserRole = (req) => getAuthenticatedUser(req)?.role || null;

// Add to a route before its controller when any signed-in user may continue:
// router.get('/account', requireAuth, accountController.show);
const requireAuth = (req, res, next) => {
  // express-session attaches the user's saved session to req for every request.
  if (!getAuthenticatedUser(req) || !getAuthenticatedUserId(req)) {
    return sendHttpError(req, res, 401, 'Please sign in to continue.');
  }
  next();
};

const requireRole = (
  roles,
  message = 'You do not have permission to access this page.',
  unauthenticatedMessage = 'Please sign in to continue.'
) => {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  // Use for role-restricted routes, e.g. requireRole('requester') or
  // requireRole(['staff', 'management']) before the route controller.
  return (req, res, next) => {
    const user = getAuthenticatedUser(req);
    if (!user || !getAuthenticatedUserId(req)) {
      return sendHttpError(req, res, 401, unauthenticatedMessage);
    }
    if (!user.email || !allowedRoles.includes(getAuthenticatedUserRole(req))) {
      return sendHttpError(req, res, 403, message);
    }
    next();
  };
};

const requireManager = (req, res, next) => {
  const user = getAuthenticatedUser(req);
  if (!user || !getAuthenticatedUserId(req)) {
    return res.redirect('/auth/login');
  }
  if (!user.email || getAuthenticatedUserRole(req) !== 'management') {
    return sendHttpError(req, res, 403, 'Only managers can access staff management.');
  }
  next();
};

// Use after requireRole when access must also be limited to one department.
const requireDepartment = (departmentId) => (req, res, next) => {
  const user = getAuthenticatedUser(req);
  if (!user || !getAuthenticatedUserId(req)) {
    return sendHttpError(req, res, 401, 'Please sign in to continue.');
  }
  if (!user.departmentId || user.departmentId !== departmentId) {
    return sendHttpError(req, res, 403, 'You do not have permission to access this department.');
  }
  next();
};

module.exports = {
  getAuthenticatedUser,
  getAuthenticatedUserId,
  getAuthenticatedUserRole,
  requireAuth,
  requireRole,
  requireManager,
  requireDepartment,
};
