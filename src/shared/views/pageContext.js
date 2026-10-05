// Per-role view context (user, nav, label) that every controller used to build itself.
// Temporary: reads mock users. Replace with the logged-in user from the session.
const { mockUsers } = require('../../../db/mock/mockData');
const { requesterNav, staffNav, managementNav } = require('./nav');

const ROLES = {
  requester: { user: mockUsers.requester, navItems: requesterNav, roleLabel: 'Citizen Portal' },
  staff: { user: mockUsers.staff, navItems: staffNav, roleLabel: 'Staff Console' },
  manager: { user: mockUsers.management, navItems: managementNav, roleLabel: 'Management Console' },
};

exports.pageContext = (role) => ({ ...ROLES[role] });
