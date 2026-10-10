// Persistence only. Temporary: mock-backed until the DB is wired.
const { mockRequests } = require('../../../db/mock/mockData');

exports.findAll = () => mockRequests;
exports.findById = (id) => mockRequests.find((r) => r.id === id);

exports.updateStatus = (id, newStatus, comment) => {
  const request = mockRequests.find((r) => r.id === id);
  if (request) {
    request.status = newStatus;
    
    // Format date like '2026-10-09 15:30'
    const now = new Date();
    const formattedDate = now.toISOString().slice(0, 16).replace('T', ' ');
    request.updatedAt = formattedDate;
    
    if (comment) {
      if (!request.comments) request.comments = [];
      request.comments.push({ 
        id: 'c_new_' + Date.now(),
        author: 'Current User', 
        authorRole: 'Staff',
        text: comment, 
        timestamp: formattedDate 
      });
    }
  }
  return request;
};
