const usersService = require('./users.service');
const { pageContext } = require('../../shared/views/pageContext');
const { getAuthenticatedUserId } = require('../auth/auth.middleware');
const { getCsrfToken } = require('../../shared/middleware/csrf.middleware');

const renderStaffList = async (
  req,
  res,
  { errors = {}, values = {}, success = null, statusCode = 200 } = {}
) => {
  const data = await usersService.listStaff(getAuthenticatedUserId(req));
  res.set('Cache-Control', 'no-store');
  return res.status(statusCode).render('users/views/manager/users', {
    ...pageContext('manager', req),
    title: 'User Management',
    activeHref: '/manager/users',
    pageTitle: 'User Management',
    pageSubtitle: 'Manage staff accounts in your department',
    csrfToken: getCsrfToken(req),
    errors,
    values,
    success,
    ...data,
  });
};

// manager: staff accounts
exports.staffList = async (req, res) => {
  try {
    return await renderStaffList(req, res, {
      success:
        req.query.status === 'created'
          ? 'Staff account created.'
          : req.query.status === 'deactivated'
            ? 'Staff account deactivated.'
            : req.query.status === 'activated'
              ? 'Staff account re-enabled.'
              : null,
    });
  } catch (error) {
    if (error instanceof usersService.ManagerDepartmentError) {
      return res.status(error.statusCode).send(error.message);
    }
    throw error;
  }
};

exports.createStaff = async (req, res) => {
  try {
    await usersService.createStaff(getAuthenticatedUserId(req), req.body);
    return res.redirect('/manager/users?status=created');
  } catch (error) {
    if (
      error instanceof usersService.StaffValidationError ||
      error instanceof usersService.DuplicateStaffEmailError
    ) {
      return renderStaffList(req, res, {
        errors: error.errors,
        values: error.values,
        statusCode: error.statusCode || 400,
      });
    }
    if (error instanceof usersService.ManagerDepartmentError) {
      return res.status(error.statusCode).send(error.message);
    }
    throw error;
  }
};

exports.deactivateStaff = async (req, res) => {
  try {
    await usersService.deactivateStaff(getAuthenticatedUserId(req), req.params.staffId);
    return res.redirect('/manager/users?status=deactivated');
  } catch (error) {
    if (error instanceof usersService.StaffNotFoundError) {
      return res.status(error.statusCode).send(error.message);
    }
    throw error;
  }
};

exports.reactivateStaff = async (req, res) => {
  try {
    await usersService.reactivateStaff(getAuthenticatedUserId(req), req.params.staffId);
    return res.redirect('/manager/users?status=activated');
  } catch (error) {
    if (
      error instanceof usersService.StaffNotFoundError ||
      error instanceof usersService.StaffAssignmentConflictError
    ) {
      return res.status(error.statusCode).send(error.message);
    }
    throw error;
  }
};

// requester: own profile settings
exports.settings = (req, res) => {
  res.render('users/views/requester/settings', {
    ...pageContext('requester', req),
    title: 'Settings',
    activeHref: '/requester/settings',
    pageTitle: 'Settings',
    pageSubtitle: 'Manage your profile and notifications',
  });
};
