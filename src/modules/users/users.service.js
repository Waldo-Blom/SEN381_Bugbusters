const usersModel = require('./users.model');

exports.listStaff = () => usersModel.findStaff();

exports.getStaffDepartment = (staffUserId) => usersModel.findStaffDepartment(staffUserId);

exports.hasDepartmentAccess = (staffUserId, departmentId) =>
  usersModel.hasDepartmentAccess(staffUserId, departmentId);

exports.verifyStaffRequestAccess = (staffUserId, requestId) =>
  usersModel.verifyStaffRequestAccess(staffUserId, requestId);
