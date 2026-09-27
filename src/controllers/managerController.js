const { mockUsers, mockRequests, mockStaffUsers, auditLog } = require('../data/mockData');
const { managementNav } = require('../utils/nav');

const user = mockUsers.management;
const base = {
  user,
  navItems: managementNav,
  roleLabel: 'Management Console',
};

exports.dashboard = (req, res) => {
  res.render('pages/manager/dashboard', {
    ...base, title: 'Management Dashboard',
    activeHref: '/manager/dashboard',
    pageTitle: 'Management Dashboard',
    pageSubtitle: 'Operational overview and metrics',
    requests: mockRequests,
  });
};

exports.allRequests = (req, res) => {
  res.render('pages/manager/all-requests', {
    ...base, title: 'All Requests',
    activeHref: '/manager/requests',
    pageTitle: 'All Requests',
    pageSubtitle: 'Every request across all departments',
    requests: mockRequests,
  });
};

exports.requestDetail = (req, res) => {
  const request = mockRequests.find((r) => r.id === req.params.id) || mockRequests[0];
  res.render('pages/manager/request-detail', {
    ...base, title: 'Request Details',
    activeHref: '/manager/requests',
    pageTitle: 'Request Details',
    pageSubtitle: 'Manager view with assignment controls',
    request,
  });
};

exports.reporting = (req, res) => {
  res.render('pages/manager/reporting', {
    ...base, title: 'Reporting & Audit',
    activeHref: '/manager/reporting',
    pageTitle: 'Reporting & Audit',
    pageSubtitle: 'Request lifecycle and action history',
    auditLog,
  });
};

exports.users = (req, res) => {
  res.render('pages/manager/users', {
    ...base, title: 'User Management',
    activeHref: '/manager/users',
    pageTitle: 'User Management',
    pageSubtitle: 'Manage staff accounts and departments',
    staffUsers: mockStaffUsers,
  });
};