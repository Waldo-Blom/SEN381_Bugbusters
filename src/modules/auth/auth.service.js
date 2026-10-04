const { mockUsers } = require('../../../db/mock/mockData');

const HOME_BY_ROLE = {
  requester: '/requester/my-requests',
  staff: '/staff/dashboard',
  management: '/manager/dashboard',
};

// Temporary: mock login keyed by the form's role field.
// Replace with a real credential check. Unknown roles fall back to requester.
exports.mockLogin = (role) => {
  const key = HOME_BY_ROLE[role] ? role : 'requester';
  return { user: mockUsers[key], redirectTo: HOME_BY_ROLE[key] };
};
