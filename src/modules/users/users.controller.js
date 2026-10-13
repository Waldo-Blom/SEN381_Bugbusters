const usersService = require('./users.service');
const usersModel = require('./users.model');
const { pageContext } = require('../../shared/views/pageContext');
const { getAuthenticatedUserId } = require('../auth/auth.middleware');
const { getCsrfToken } = require('../../shared/middleware/csrf.middleware');
const { sendHttpError } = require('../../shared/middleware/error.middleware');
const { isValidEmail } = require('../../shared/validation/input');

const renderAdminUsers = async (
  req,
  res,
  { error = null, success = null, statusCode = 200 } = {}
) => {
  const data = await usersService.listAdminUsers();
  res.set('Cache-Control', 'no-store');
  return res.status(statusCode).render('users/views/admin/users', {
    ...pageContext('admin', req),
    title: 'User Management',
    activeHref: '/admin/users',
    pageTitle: 'User Management',
    pageSubtitle: 'Manage managers and staff across all departments',
    csrfToken: getCsrfToken(req),
    error,
    success,
    ...data,
  });
};

const renderManagerForm = async (req, res, { errors = {}, values = {}, statusCode = 200 } = {}) => {
  const departments = await usersService.listAdminDepartments();
  res.set('Cache-Control', 'no-store');
  return res.status(statusCode).render('users/views/admin/create-user', {
    ...pageContext('admin', req),
    title: 'Create Manager',
    activeHref: '/admin/users',
    pageTitle: 'Create Manager Account',
    pageSubtitle: 'Register a manager and assign their department',
    csrfToken: getCsrfToken(req),
    errors,
    values,
    departments,
  });
};

const renderDepartmentForm = async (
  req,
  res,
  { errors = {}, values = {}, statusCode = 200 } = {}
) => {
  res.set('Cache-Control', 'no-store');
  return res.status(statusCode).render('users/views/admin/create-department', {
    ...pageContext('admin', req),
    title: 'Create Department',
    activeHref: '/admin/departments',
    pageTitle: 'Create Department',
    pageSubtitle: 'Add a department, then assign a manager when creating their account',
    csrfToken: getCsrfToken(req),
    errors,
    values,
  });
};

const renderAdminDepartments = async (req, res) => {
  const departments = await usersService.listDepartmentsForAdmin();
  res.set('Cache-Control', 'no-store');
  return res.render('users/views/admin/departments', {
    ...pageContext('admin', req),
    title: 'Departments',
    activeHref: '/admin/departments',
    pageTitle: 'Departments',
    pageSubtitle: 'Manage departments and their manager assignments',
    departments,
    success: req.query.status === 'created' ? 'Department created.' : null,
  });
};

const renderAdminCategories = async (
  req,
  res,
  { errors = {}, values = {}, statusCode = 200, error = null } = {}
) => {
  const [categories, departments] = await Promise.all([
    usersService.listRequestCategoriesForAdmin(),
    usersService.listAdminDepartments(),
  ]);
  res.set('Cache-Control', 'no-store');
  return res.status(statusCode).render('users/views/admin/categories', {
    ...pageContext('admin', req),
    title: 'Request Categories',
    activeHref: '/admin/categories',
    pageTitle: 'Request Categories',
    pageSubtitle: 'Route each request category to exactly one department',
    csrfToken: getCsrfToken(req),
    categories,
    departments,
    errors,
    values,
    error,
    success:
      req.query.status === 'created'
        ? 'Request category created.'
        : req.query.status === 'deactivated'
          ? 'Request category disabled.'
          : req.query.status === 'activated'
            ? 'Request category enabled.'
            : null,
  });
};

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
      return sendHttpError(req, res, error.statusCode, error.message);
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
      return sendHttpError(req, res, error.statusCode, error.message);
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
      return sendHttpError(req, res, error.statusCode, error.message);
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
      return sendHttpError(req, res, error.statusCode, error.message);
    }
    throw error;
  }
};

exports.adminUsers = async (req, res) =>
  renderAdminUsers(req, res, {
    success:
      req.query.status === 'created'
        ? 'Manager account created.'
        : req.query.status === 'deactivated'
          ? 'User account deactivated.'
          : req.query.status === 'activated'
            ? 'User account re-enabled.'
            : null,
  });

exports.createManagerPage = (req, res) => renderManagerForm(req, res);

exports.createManager = async (req, res) => {
  try {
    await usersService.createManager(getAuthenticatedUserId(req), req.body);
    return res.redirect('/admin/users?status=created');
  } catch (error) {
    if (
      error instanceof usersService.ManagerValidationError ||
      error instanceof usersService.DuplicateManagerEmailError ||
      error instanceof usersService.AdminDepartmentNotFoundError
    ) {
      return renderManagerForm(req, res, {
        errors: error.errors,
        values: error.values || {},
        statusCode: error.statusCode || 400,
      });
    }
    throw error;
  }
};

exports.createDepartmentPage = (req, res) => renderDepartmentForm(req, res);
exports.adminDepartments = (req, res) => renderAdminDepartments(req, res);
exports.adminCategories = (req, res) => renderAdminCategories(req, res);

exports.createRequestCategory = async (req, res) => {
  try {
    await usersService.createRequestCategory(getAuthenticatedUserId(req), req.body);
    return res.redirect('/admin/categories?status=created');
  } catch (error) {
    if (
      error instanceof usersService.RequestCategoryValidationError ||
      error instanceof usersService.DuplicateRequestCategoryNameError ||
      error instanceof usersService.RequestCategoryDepartmentError
    ) {
      return renderAdminCategories(req, res, {
        errors: error.errors,
        values: error.values || {},
        statusCode: error.statusCode || 400,
      });
    }
    throw error;
  }
};

exports.deactivateRequestCategory = async (req, res) => {
  try {
    await usersService.deactivateRequestCategory(
      getAuthenticatedUserId(req),
      req.params.categoryId
    );
    return res.redirect('/admin/categories?status=deactivated');
  } catch (error) {
    if (error instanceof usersService.RequestCategoryNotFoundError) {
      return sendHttpError(req, res, error.statusCode, error.message);
    }
    throw error;
  }
};

exports.reactivateRequestCategory = async (req, res) => {
  try {
    await usersService.reactivateRequestCategory(
      getAuthenticatedUserId(req),
      req.params.categoryId
    );
    return res.redirect('/admin/categories?status=activated');
  } catch (error) {
    if (error instanceof usersService.RequestCategoryNotFoundError) {
      return sendHttpError(req, res, error.statusCode, error.message);
    }
    throw error;
  }
};

exports.createDepartment = async (req, res) => {
  try {
    await usersService.createDepartment(getAuthenticatedUserId(req), req.body);
    return res.redirect('/admin/departments?status=created');
  } catch (error) {
    if (
      error instanceof usersService.DepartmentValidationError ||
      error instanceof usersService.DuplicateDepartmentNameError
    ) {
      return renderDepartmentForm(req, res, {
        errors: error.errors,
        values: error.values,
        statusCode: error.statusCode || 400,
      });
    }
    throw error;
  }
};

exports.deactivateUser = async (req, res) => {
  try {
    await usersService.deactivateUserForAdmin(getAuthenticatedUserId(req), req.params.userId);
    return res.redirect('/admin/users?status=deactivated');
  } catch (error) {
    if (error instanceof usersService.AdminUserNotFoundError) {
      return sendHttpError(req, res, error.statusCode, error.message);
    }
    throw error;
  }
};

exports.reactivateUser = async (req, res) => {
  try {
    await usersService.reactivateUserForAdmin(getAuthenticatedUserId(req), req.params.userId);
    return res.redirect('/admin/users?status=activated');
  } catch (error) {
    if (
      error instanceof usersService.AdminUserNotFoundError ||
      error instanceof usersService.AdminUserAssignmentConflictError
    ) {
      return renderAdminUsers(req, res, {
        error: error.message,
        statusCode: error.statusCode,
      });
    }
    throw error;
  }
};

// requester: own profile settings
const renderRequesterSettings = async (
  req,
  res,
  { error = null, success = null, profile = null } = {}
) => {
  const settings = await usersModel.findRequesterSettings(getAuthenticatedUserId(req));
  if (!settings) return sendHttpError(req, res, 404, 'Requester account not found.');
  const name = `${settings.firstName} ${settings.lastName}`;
  const user = {
    ...pageContext('requester', req).user,
    ...settings,
    name,
    avatarInitials: `${settings.firstName[0] || ''}${settings.lastName[0] || ''}`.toUpperCase(),
  };
  return res.set('Cache-Control', 'no-store').render('users/views/requester/settings', {
    ...pageContext('requester', req),
    user,
    settings,
    profile: profile || { ...settings, name },
    title: 'Settings',
    activeHref: '/requester/settings',
    pageTitle: 'Settings',
    pageSubtitle: 'Manage your profile and notifications',
    csrfToken: getCsrfToken(req),
    error,
    success,
  });
};

exports.settings = async (req, res) =>
  renderRequesterSettings(req, res, {
    success:
      req.query.profile === 'saved'
        ? 'Profile updated.'
        : req.query.notifications === 'saved'
          ? 'Notification preferences updated.'
          : null,
  });

exports.updateRequesterProfile = async (req, res) => {
  const field = (key) => (typeof req.body[key] === 'string' ? req.body[key].trim() : '');
  const firstName = field('firstName');
  const lastName = field('lastName');
  const email = field('email').toLowerCase();
  const phone = field('phone');
  const profile = {
    firstName,
    lastName,
    email,
    phone,
    name: `${firstName} ${lastName}`.trim(),
  };
  if (
    !firstName ||
    !lastName ||
    firstName.length > 100 ||
    lastName.length > 100 ||
    !isValidEmail(email) ||
    phone.length > 15
  ) {
    return renderRequesterSettings(req, res, {
      error: 'Enter a valid name and email. Phone must fit its 15 character limit.',
      profile,
    });
  }
  try {
    const updated = await usersModel.updateRequesterProfile(getAuthenticatedUserId(req), profile);
    if (!updated) return sendHttpError(req, res, 404, 'Requester account not found.');
    req.session.user.name = `${updated.firstName} ${updated.lastName}`;
    req.session.user.email = updated.email;
    req.session.user.avatarInitials = `${updated.firstName[0]}${updated.lastName[0]}`.toUpperCase();
    return res.redirect('/requester/settings?profile=saved');
  } catch (error) {
    if (error.code === '23505') {
      return renderRequesterSettings(req, res, {
        error: 'That email address is already in use.',
        profile,
      });
    }
    throw error;
  }
};

exports.updateRequesterNotifications = async (req, res) => {
  await usersModel.updateRequesterNotifications(getAuthenticatedUserId(req), {
    emailNotificationsEnabled: req.body.emailNotificationsEnabled === 'on',
  });
  return res.redirect('/requester/settings?notifications=saved');
};
