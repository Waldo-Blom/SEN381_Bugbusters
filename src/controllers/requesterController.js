const { mockUsers, mockRequests } = require('../data/mockData');
const { requesterNav } = require('../utils/nav');

const user = mockUsers.requester;
const base = {
  user,
  navItems: requesterNav,
  roleLabel: 'Citizen Portal',
};

exports.submitPage = (req, res) => {
  res.render('pages/requester/submit', {
    ...base, title: 'Submit a Request',
    activeHref: '/requester/submit',
    pageTitle: 'Submit a Request',
    pageSubtitle: 'Report an issue in your community',
  });
};

exports.myRequests = (req, res) => {
  res.render('pages/requester/my-requests', {
    ...base, title: 'My Requests',
    activeHref: '/requester/my-requests',
    pageTitle: 'My Requests',
    pageSubtitle: 'Track the status of your submissions',
    requests: mockRequests,
  });
};

exports.requestDetail = (req, res) => {
  const request = mockRequests.find((r) => r.id === req.params.id) || mockRequests[0];
  res.render('pages/requester/request-detail', {
    ...base, title: 'Request Details',
    activeHref: '/requester/my-requests',
    pageTitle: 'Request Details',
    pageSubtitle: 'Full request information and timeline',
    request,
  });
};

exports.settings = (req, res) => {
  res.render('pages/requester/settings', {
    ...base, title: 'Settings',
    activeHref: '/requester/settings',
    pageTitle: 'Settings',
    pageSubtitle: 'Manage your profile and notifications',
  });
};