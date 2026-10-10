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

exports.myRequests = async (req, res) => {
  res.render('requests/views/requester/my-requests', {
    ...pageContext('requester'),
    title: 'My Requests',
    activeHref: '/requester/my-requests',
    pageTitle: 'My Requests',
    pageSubtitle: 'Track the status of your submissions',
    requests: await requestsService.list(),
  });
};

exports.requesterDetail = async (req, res) => {
  res.render('requests/views/requester/request-detail', {
    ...pageContext('requester'),
    title: 'Request Details',
    activeHref: '/requester/my-requests',
    pageTitle: 'Request Details',
    pageSubtitle: 'Full request information and timeline',
    request: await requestsService.getById(req.params.id),
  });
};

// ---- staff ----
exports.staffSearch = async (req, res) => {
  res.render('requests/views/staff/search', {
    ...pageContext('staff'),
    title: 'Search & Filter',
    activeHref: '/staff/search',
    pageTitle: 'Search & Filter',
    pageSubtitle: 'Find requests across all categories',
    requests: await requestsService.list(),
  });
};

exports.staffDetail = async (req, res) => {
  res.render('requests/views/staff/request-detail', {
    ...pageContext('staff'),
    title: 'Request Details',
    activeHref: '/staff/dashboard',
    pageTitle: 'Request Details',
    pageSubtitle: 'Manage and resolve this request',
    request: await requestsService.getById(req.params.id),
  });
};

// ---- manager ----
exports.allRequests = async (req, res) => {
  res.render('requests/views/manager/all-requests', {
    ...pageContext('manager'),
    title: 'All Requests',
    activeHref: '/manager/requests',
    pageTitle: 'All Requests',
    pageSubtitle: 'Every request across all departments',
    requests: await requestsService.list(),
  });
};

exports.managerDetail = async (req, res) => {
  res.render('requests/views/manager/request-detail', {
    ...pageContext('manager'),
    title: 'Request Details',
    activeHref: '/manager/requests',
    pageTitle: 'Request Details',
    pageSubtitle: 'Manager view with assignment controls',
    request: await requestsService.getById(req.params.id),
  });
};

exports.assignRequest = async (req, res) => {
  const requestId = req.params.id;
  const staffId = req.user?.id || 'staff-1'; // Mocked auth
  try {
    await requestsService.workflow.transitionRequest(requestId, 'Assigned', staffId);
    res.redirect(`/staff/requests/${requestId}`);
  } catch (error) {
    res.status(400).send(error.message);
  }
};

exports.startProgress = async (req, res) => {
  const requestId = req.params.id;
  const staffId = req.user?.id || 'staff-1'; // Mocked auth
  try {
    await requestsService.workflow.transitionRequest(requestId, 'In Progress', staffId);
    res.redirect(`/staff/requests/${requestId}`);
  } catch (error) {
    res.status(400).send(error.message);
  }
};

exports.resolveRequest = async (req, res) => {
  const requestId = req.params.id;
  const { comment } = req.body;
  const staffId = req.user?.id || 'staff-1'; // Mocked auth
  try {
    await requestsService.workflow.transitionRequest(requestId, 'Resolved', staffId, comment);
    res.redirect(`/staff/requests/${requestId}`);
  } catch (error) {
    res.status(400).send(error.message);
  }
};

exports.rejectRequest = async (req, res) => {
  const requestId = req.params.id;
  const staffId = req.user?.id || 'staff-1'; // Mocked auth
  try {
    await requestsService.workflow.transitionRequest(requestId, 'Rejected', staffId);
    res.redirect(`/staff/requests/${requestId}`);
  } catch (error) {
    res.status(400).send(error.message);
  }
};

exports.closeRequest = async (req, res) => {
  const requestId = req.params.id;
  const managerId = req.user?.id || 'manager-1'; // Mocked auth
  try {
    await requestsService.workflow.transitionRequest(requestId, 'Closed', managerId);
    res.redirect(`/manager/requests/${requestId}`);
  } catch (error) {
    res.status(400).send(error.message);
  }
};
