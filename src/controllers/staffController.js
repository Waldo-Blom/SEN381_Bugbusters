const { mockUsers, mockRequests } = require('../data/mockData');
const { staffNav } = require('../utils/nav');

const user = mockUsers.staff;
const base = {
  user,
  navItems: staffNav,
  roleLabel: 'Staff Console',
};

exports.dashboard = (req, res) => {
  res.render('pages/staff/dashboard', {
    ...base,
    title: 'Staff Dashboard',
    activeHref: '/staff/dashboard',
    pageTitle: 'Staff Dashboard',
    pageSubtitle: 'Requests assigned to your department',
    requests: mockRequests,
  });
};

exports.search = (req, res) => {
  res.render('pages/staff/search', {
    ...base,
    title: 'Search & Filter',
    activeHref: '/staff/search',
    pageTitle: 'Search & Filter',
    pageSubtitle: 'Find requests across all categories',
    requests: mockRequests,
  });
};

exports.requestDetail = (req, res) => {
  const request = mockRequests.find((r) => r.id === req.params.id) || mockRequests[0];
  res.render('pages/staff/request-detail', {
    ...base,
    title: 'Request Details',
    activeHref: '/staff/dashboard',
    pageTitle: 'Request Details',
    pageSubtitle: 'Manage and resolve this request',
    request,
  });
};
