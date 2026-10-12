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

exports.getStaffDepartment = (staffUserId) => usersModel.findStaffDepartment(staffUserId);

exports.hasDepartmentAccess = (staffUserId, departmentId) =>
  usersModel.hasDepartmentAccess(staffUserId, departmentId);

exports.verifyStaffRequestAccess = (staffUserId, requestId) =>
  usersModel.verifyStaffRequestAccess(staffUserId, requestId);
