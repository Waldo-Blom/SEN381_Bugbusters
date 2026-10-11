const usersService = require('./users.service');
const { pageContext } = require('../../shared/views/pageContext');

// manager: staff accounts
exports.staffList = (req, res) => {
  res.render('users/views/manager/users', {
    ...pageContext('manager', req),
    title: 'User Management',
    activeHref: '/manager/users',
    pageTitle: 'User Management',
    pageSubtitle: 'Manage staff accounts and departments',
    staffUsers: usersService.listStaff(),
  });
};

// requester: own profile settings
exports.settings = (req, res) => {
  res.render('users/views/requester/settings', {
    ...pageContext('requester', req),
    title: 'Settings',
    activeHref: '/requester/settings',
    pageTitle: 'Settings',
    pageSubtitle: 'Manage your profile and notifications',
  });
};
