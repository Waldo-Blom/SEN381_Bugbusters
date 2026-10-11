const requireAuth = (req, res, next) => {
  // express-session attaches the user's saved session to req for every request.
  if (!req.session?.user) {
    return res.status(401).send('Please sign in to continue.');
  }
  next();
};

const requireRole = (
  roles,
  message = 'You do not have permission to access this page.',
  unauthenticatedMessage = 'Please sign in to continue.'
) => {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.session?.user) {
      return res.status(401).send(unauthenticatedMessage);
    }
    if (!req.session.user.email || !allowedRoles.includes(req.session.user.role)) {
      return res.status(403).send(message);
    }
    next();
  };
};

const requireDepartment = (departmentId) => (req, res, next) => {
  if (!req.session?.user) {
    return res.status(401).send('Please sign in to continue.');
  }
  if (!req.session.user.departmentId || req.session.user.departmentId !== departmentId) {
    return res.status(403).send('You do not have permission to access this department.');
  }
  next();
};

module.exports = { requireAuth, requireRole, requireDepartment };
