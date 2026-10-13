const { requesterNav, staffNav, managementNav, adminNav, operatorNav } = require('./nav');
const { getAuthenticatedUser } = require('../../modules/auth/auth.middleware');

const ROLES = {
  requester: { navItems: requesterNav, roleLabel: 'Citizen Portal' },
  staff: { navItems: staffNav, roleLabel: 'Staff Console' },
  manager: { navItems: managementNav, roleLabel: 'Management Console' },
  admin: { navItems: adminNav, roleLabel: 'Administration Console' },
  operator: { navItems: operatorNav, roleLabel: 'Operator Console' },
};

const EMPTY_USER = { name: '', email: '', avatarInitials: '' };

exports.pageContext = (role, req) => ({
  ...ROLES[role],
  user: getAuthenticatedUser(req) || EMPTY_USER,
});
