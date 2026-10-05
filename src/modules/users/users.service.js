const usersModel = require('./users.model');

exports.listStaff = () => usersModel.findStaff();
