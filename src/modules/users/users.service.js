const usersModel = require('./users.model');
const bcrypt = require('bcrypt');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BCRYPT_BYTES = 72;
const BCRYPT_ROUNDS = 12;

class StaffValidationError extends Error {
  constructor(errors, values) {
    super('Please correct the staff account details.');
    this.name = 'StaffValidationError';
    this.errors = errors;
    this.values = values;
  }
}

class ManagerDepartmentError extends Error {
  constructor() {
    super('You do not manage an active department.');
    this.name = 'ManagerDepartmentError';
    this.statusCode = 403;
  }
}

class DuplicateStaffEmailError extends Error {
  constructor(values) {
    super('An account with this email address already exists.');
    this.name = 'DuplicateStaffEmailError';
    this.errors = { email: 'An account with this email address already exists.' };
    this.values = values;
    this.statusCode = 409;
  }
}

class StaffNotFoundError extends Error {
  constructor() {
    super('That staff member is not assigned to your department.');
    this.name = 'StaffNotFoundError';
    this.statusCode = 404;
  }
}

class StaffAssignmentConflictError extends Error {
  constructor() {
    super('This staff member already has an active department assignment.');
    this.name = 'StaffAssignmentConflictError';
    this.statusCode = 409;
  }
}

class ManagerValidationError extends Error {
  constructor(errors, values) {
    super('Please correct the manager account details.');
    this.name = 'ManagerValidationError';
    this.errors = errors;
    this.values = values;
  }
}

class DuplicateManagerEmailError extends Error {
  constructor(values) {
    super('An account with this email address already exists.');
    this.name = 'DuplicateManagerEmailError';
    this.errors = { email: 'An account with this email address already exists.' };
    this.values = values;
    this.statusCode = 409;
  }
}

class AdminDepartmentNotFoundError extends Error {
  constructor(values = {}) {
    super('Select an active department.');
    this.name = 'AdminDepartmentNotFoundError';
    this.errors = { departmentId: 'Select an active department.' };
    this.values = values;
    this.statusCode = 400;
  }
}

class AdminUserNotFoundError extends Error {
  constructor() {
    super('That manager or staff account was not found.');
    this.name = 'AdminUserNotFoundError';
    this.statusCode = 404;
  }
}

class AdminUserAssignmentConflictError extends Error {
  constructor() {
    super('This staff member already has an active department assignment.');
    this.name = 'AdminUserAssignmentConflictError';
    this.statusCode = 409;
  }
}

class DepartmentValidationError extends Error {
  constructor(errors, values) {
    super('Please correct the department details.');
    this.name = 'DepartmentValidationError';
    this.errors = errors;
    this.values = values;
    this.statusCode = 400;
  }
}

class DuplicateDepartmentNameError extends Error {
  constructor(values) {
    super('A department with this name already exists.');
    this.name = 'DuplicateDepartmentNameError';
    this.errors = { name: 'A department with this name already exists.' };
    this.values = values;
    this.statusCode = 409;
  }
}

class RequestCategoryValidationError extends Error {
  constructor(errors, values) {
    super('Please correct the request category details.');
    this.name = 'RequestCategoryValidationError';
    this.errors = errors;
    this.values = values;
    this.statusCode = 400;
  }
}

class DuplicateRequestCategoryNameError extends Error {
  constructor(values) {
    super('A request category with this name already exists.');
    this.name = 'DuplicateRequestCategoryNameError';
    this.errors = { name: 'A request category with this name already exists.' };
    this.values = values;
    this.statusCode = 409;
  }
}

class RequestCategoryDepartmentError extends Error {
  constructor(values) {
    super('Select an active department for this request category.');
    this.name = 'RequestCategoryDepartmentError';
    this.errors = { departmentId: this.message };
    this.values = values;
    this.statusCode = 400;
  }
}

class RequestCategoryNotFoundError extends Error {
  constructor() {
    super('That active request category was not found.');
    this.name = 'RequestCategoryNotFoundError';
    this.statusCode = 404;
  }
}

const validateStaffDetails = (input = {}) => {
  const firstName = typeof input.firstName === 'string' ? input.firstName.trim() : '';
  const lastName = typeof input.lastName === 'string' ? input.lastName.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const phone = typeof input.phone === 'string' ? input.phone.trim() : '';
  const password = typeof input.password === 'string' ? input.password : '';
  const errors = {};

  if (!firstName || firstName.length > 100) {
    errors.firstName = 'Enter a first name (up to 100 characters).';
  }
  if (!lastName || lastName.length > 100) {
    errors.lastName = 'Enter a last name (up to 100 characters).';
  }
  if (!email || email.length > 255 || !EMAIL_PATTERN.test(email)) {
    errors.email = 'Enter a valid email address.';
  }
  if (phone.length > 15) {
    errors.phone = 'Phone number must be 15 characters or fewer.';
  }
  if (
    password.length < 8 ||
    !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password) ||
    Buffer.byteLength(password, 'utf8') > MAX_BCRYPT_BYTES
  ) {
    errors.password =
      'Use at least 8 characters, including an uppercase letter and a number (maximum 72 bytes).';
  }

  return {
    errors,
    values: { firstName, lastName, email, phone },
    password,
  };
};

exports.StaffValidationError = StaffValidationError;
exports.ManagerDepartmentError = ManagerDepartmentError;
exports.DuplicateStaffEmailError = DuplicateStaffEmailError;
exports.StaffNotFoundError = StaffNotFoundError;
exports.StaffAssignmentConflictError = StaffAssignmentConflictError;
exports.ManagerValidationError = ManagerValidationError;
exports.DuplicateManagerEmailError = DuplicateManagerEmailError;
exports.AdminDepartmentNotFoundError = AdminDepartmentNotFoundError;
exports.AdminUserNotFoundError = AdminUserNotFoundError;
exports.AdminUserAssignmentConflictError = AdminUserAssignmentConflictError;
exports.DepartmentValidationError = DepartmentValidationError;
exports.DuplicateDepartmentNameError = DuplicateDepartmentNameError;
exports.RequestCategoryValidationError = RequestCategoryValidationError;
exports.DuplicateRequestCategoryNameError = DuplicateRequestCategoryNameError;
exports.RequestCategoryDepartmentError = RequestCategoryDepartmentError;
exports.RequestCategoryNotFoundError = RequestCategoryNotFoundError;

exports.listStaff = async (managerId) => {
  const department = await usersModel.findManagerDepartment(managerId);
  if (!department) throw new ManagerDepartmentError();
  const staffUsers = await usersModel.findStaffForManager(managerId, department.departmentId);
  return {
    department: { id: department.departmentId, name: department.departmentName },
    staffUsers,
  };
};

exports.createStaff = async (managerId, input) => {
  const { errors, values, password } = validateStaffDetails(input);
  if (Object.keys(errors).length) throw new StaffValidationError(errors, values);

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const result = await usersModel.createStaff(managerId, {
    ...values,
    passwordHash,
  });
  if (result.departmentMissing) throw new ManagerDepartmentError();
  if (result.duplicateEmail) throw new DuplicateStaffEmailError(values);
  return result;
};

exports.deactivateStaff = async (managerId, staffId) => {
  if (typeof staffId !== 'string' || !UUID_PATTERN.test(staffId)) {
    throw new StaffNotFoundError();
  }
  const deactivated = await usersModel.deactivateStaff(managerId, staffId);
  if (!deactivated) throw new StaffNotFoundError();
};

exports.reactivateStaff = async (managerId, staffId) => {
  if (typeof staffId !== 'string' || !UUID_PATTERN.test(staffId)) {
    throw new StaffNotFoundError();
  }
  const result = await usersModel.reactivateStaff(managerId, staffId);
  if (result.notFound) throw new StaffNotFoundError();
  if (result.activeAssignmentExists) throw new StaffAssignmentConflictError();
};

exports.listAdminUsers = async () => {
  const [users, departments] = await Promise.all([
    usersModel.findUsersForAdmin(),
    usersModel.findAdminDepartments(),
  ]);
  return { users, departments };
};

exports.listAdminDepartments = () => usersModel.findAdminDepartments();
exports.listDepartmentsForAdmin = () => usersModel.findDepartmentsForAdmin();
exports.listRequestCategoriesForAdmin = () => usersModel.findRequestCategoriesForAdmin();

exports.createDepartment = async (adminId, input = {}) => {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  const errors = {};
  if (!name || name.length > 100) {
    errors.name = 'Enter a department name (up to 100 characters).';
  }
  if (description.length > 2000) {
    errors.description = 'Department description must be 2000 characters or fewer.';
  }
  const values = { name, description };
  if (Object.keys(errors).length) throw new DepartmentValidationError(errors, values);

  const result = await usersModel.createDepartment(adminId, values);
  if (result.duplicateName) throw new DuplicateDepartmentNameError(values);
  return result;
};

exports.createRequestCategory = async (adminId, input = {}) => {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  const departmentId = typeof input.departmentId === 'string' ? input.departmentId.trim() : '';
  const errors = {};
  if (!name || name.length > 100) {
    errors.name = 'Enter a category name (up to 100 characters).';
  }
  if (description.length > 2000) {
    errors.description = 'Category description must be 2000 characters or fewer.';
  }
  if (!UUID_PATTERN.test(departmentId)) {
    errors.departmentId = 'Select an active department for this request category.';
  }
  const values = { name, description, departmentId };
  if (Object.keys(errors).length) throw new RequestCategoryValidationError(errors, values);

  const result = await usersModel.createRequestCategory(adminId, values);
  if (result.departmentMissing) throw new RequestCategoryDepartmentError(values);
  if (result.duplicateName) throw new DuplicateRequestCategoryNameError(values);
  return result;
};

exports.deactivateRequestCategory = async (adminId, categoryId) => {
  if (typeof categoryId !== 'string' || !UUID_PATTERN.test(categoryId)) {
    throw new RequestCategoryNotFoundError();
  }
  const deactivated = await usersModel.deactivateRequestCategory(adminId, categoryId);
  if (!deactivated) throw new RequestCategoryNotFoundError();
};

exports.reactivateRequestCategory = async (adminId, categoryId) => {
  if (typeof categoryId !== 'string' || !UUID_PATTERN.test(categoryId)) {
    throw new RequestCategoryNotFoundError();
  }
  const reactivated = await usersModel.reactivateRequestCategory(adminId, categoryId);
  if (!reactivated) throw new RequestCategoryNotFoundError();
};

exports.createManager = async (adminId, input) => {
  const { errors, values, password } = validateStaffDetails(input);
  const departmentId = typeof input.departmentId === 'string' ? input.departmentId.trim() : '';
  const managerValues = { ...values, departmentId };
  if (!UUID_PATTERN.test(departmentId)) {
    errors.departmentId = 'Select an active department.';
  }
  if (Object.keys(errors).length) throw new ManagerValidationError(errors, managerValues);

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const result = await usersModel.createManager(adminId, {
    ...values,
    passwordHash,
    departmentId,
  });
  if (result.departmentMissing) throw new AdminDepartmentNotFoundError(managerValues);
  if (result.duplicateEmail) throw new DuplicateManagerEmailError(managerValues);
  return result;
};

exports.deactivateUserForAdmin = async (adminId, userId) => {
  if (typeof userId !== 'string' || !UUID_PATTERN.test(userId)) {
    throw new AdminUserNotFoundError();
  }
  const deactivated = await usersModel.deactivateUserForAdmin(adminId, userId);
  if (!deactivated) throw new AdminUserNotFoundError();
};

exports.reactivateUserForAdmin = async (adminId, userId) => {
  if (typeof userId !== 'string' || !UUID_PATTERN.test(userId)) {
    throw new AdminUserNotFoundError();
  }
  const result = await usersModel.reactivateUserForAdmin(adminId, userId);
  if (result.notFound) throw new AdminUserNotFoundError();
  if (result.activeAssignmentExists) throw new AdminUserAssignmentConflictError();
};

exports.getStaffDepartment = (staffUserId) => usersModel.findStaffDepartment(staffUserId);

exports.hasDepartmentAccess = (staffUserId, departmentId) =>
  usersModel.hasDepartmentAccess(staffUserId, departmentId);

exports.verifyStaffRequestAccess = (staffUserId, requestId) =>
  usersModel.verifyStaffRequestAccess(staffUserId, requestId);
