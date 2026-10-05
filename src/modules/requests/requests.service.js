const requestsModel = require('./requests.model');

exports.list = () => requestsModel.findAll();

// TODO: return a 404 instead of falling back to the first request.
exports.getById = (id) => requestsModel.findById(id) || requestsModel.findAll()[0];
