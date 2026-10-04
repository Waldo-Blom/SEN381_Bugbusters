// Persistence only. Temporary: mock-backed until the DB is wired.
const { mockStaffUsers } = require('../../../db/mock/mockData');

exports.findStaff = () => mockStaffUsers;
