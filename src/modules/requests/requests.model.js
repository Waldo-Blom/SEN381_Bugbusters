// Persistence only. Temporary: mock-backed until the DB is wired.
const { mockRequests } = require('../../../db/mock/mockData');

exports.findAll = () => mockRequests;
exports.findById = (id) => mockRequests.find((r) => r.id === id);
