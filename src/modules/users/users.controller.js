const usersService = require('./users.service');
const { pageContext } = require('../../shared/views/pageContext');
const { getAuthenticatedUserId } = require('../auth/auth.middleware');
const { getCsrfToken } = require('../../shared/middleware/csrf.middleware');

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
      return res.status(error.statusCode).send(error.message);
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
      return res.status(error.statusCode).send(error.message);
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
      return res.status(error.statusCode).send(error.message);
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
exports.settings = (req, res) => {
  res.render('users/views/requester/settings', {
    ...pageContext('requester', req),
    title: 'Settings',
    activeHref: '/requester/settings',
    pageTitle: 'Settings',
    pageSubtitle: 'Manage your profile and notifications',
  });
};
