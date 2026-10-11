const { requesterNav, staffNav, managementNav, operatorNav } = require('./nav');

const ROLES = {
  requester: { navItems: requesterNav, roleLabel: 'Citizen Portal' },
  staff: { navItems: staffNav, roleLabel: 'Staff Console' },
  manager: { navItems: managementNav, roleLabel: 'Management Console' },
  operator: { navItems: operatorNav, roleLabel: 'Operator Console' },
};

const EMPTY_USER = { name: '', email: '', avatarInitials: '' };

exports.pageContext = (role, sessionUser) => ({
  ...ROLES[role],
  user: sessionUser || EMPTY_USER,
});
