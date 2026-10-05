const requestsService = require('./requests.service');
const { pageContext } = require('../../shared/views/pageContext');

// ---- requester ----
exports.submitPage = (req, res) => {
  res.render('requests/views/requester/submit', {
    ...pageContext('requester'),
    title: 'Submit a Request',
    activeHref: '/requester/submit',
    pageTitle: 'Submit a Request',
    pageSubtitle: 'Report an issue in your community',
  });
};

exports.myRequests = (req, res) => {
  res.render('requests/views/requester/my-requests', {
    ...pageContext('requester'),
    title: 'My Requests',
    activeHref: '/requester/my-requests',
    pageTitle: 'My Requests',
    pageSubtitle: 'Track the status of your submissions',
    requests: requestsService.list(),
  });
};

exports.requesterDetail = (req, res) => {
  res.render('requests/views/requester/request-detail', {
    ...pageContext('requester'),
    title: 'Request Details',
    activeHref: '/requester/my-requests',
    pageTitle: 'Request Details',
    pageSubtitle: 'Full request information and timeline',
    request: requestsService.getById(req.params.id),
  });
};

// ---- staff ----
exports.staffSearch = (req, res) => {
  res.render('requests/views/staff/search', {
    ...pageContext('staff'),
    title: 'Search & Filter',
    activeHref: '/staff/search',
    pageTitle: 'Search & Filter',
    pageSubtitle: 'Find requests across all categories',
    requests: requestsService.list(),
  });
};

exports.staffDetail = (req, res) => {
  res.render('requests/views/staff/request-detail', {
    ...pageContext('staff'),
    title: 'Request Details',
    activeHref: '/staff/dashboard',
    pageTitle: 'Request Details',
    pageSubtitle: 'Manage and resolve this request',
    request: requestsService.getById(req.params.id),
  });
};

// ---- manager ----
exports.allRequests = (req, res) => {
  res.render('requests/views/manager/all-requests', {
    ...pageContext('manager'),
    title: 'All Requests',
    activeHref: '/manager/requests',
    pageTitle: 'All Requests',
    pageSubtitle: 'Every request across all departments',
    requests: requestsService.list(),
  });
};

exports.managerDetail = (req, res) => {
  res.render('requests/views/manager/request-detail', {
    ...pageContext('manager'),
    title: 'Request Details',
    activeHref: '/manager/requests',
    pageTitle: 'Request Details',
    pageSubtitle: 'Manager view with assignment controls',
    request: requestsService.getById(req.params.id),
  });
};
