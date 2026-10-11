const requestsService = require('./requests.service');
const { REQUEST_STATUSES } = require('./requests.constants');
const { pageContext } = require('../../shared/views/pageContext');
const { getAuthenticatedUserId, getAuthenticatedUserRole } = require('../auth/auth.middleware');

// ---- requester ----
const submissionView = async (req, res, role, options = {}) => {
  const isOperator = role === 'operator';
  const submitPath = isOperator ? '/operator/submit' : '/requester/submit';
  const categories = await requestsService.listCategories();
  res.render('requests/views/requester/submit', {
    ...pageContext(role, req),
    title: isOperator ? 'Log a Request' : 'Submit a Request',
    activeHref: submitPath,
    pageTitle: isOperator ? 'Log a Request' : 'Submit a Request',
    pageSubtitle: isOperator
      ? 'Log a community member’s request'
      : 'Report an issue in your community',
    errors: {},
    values: {},
    isOperator,
    formAction: submitPath,
    successReference: null,
    ...options,
    categories,
  });
};

exports.submitPage = async (req, res, next) => {
  try {
    await submissionView(req, res, 'requester');
  } catch (error) {
    next(error);
  }
};

exports.operatorSubmitPage = async (req, res, next) => {
  try {
    await submissionView(req, res, 'operator', {
      successReference: req.query.submitted || null,
    });
  } catch (error) {
    next(error);
  }
};

exports.operatorLoggedRequests = async (req, res, next) => {
  try {
    const requests = await requestsService.listCreatedByOperator(getAuthenticatedUserId(req));
    res.render('requests/views/operator/logged-requests', {
      ...pageContext('operator', req),
      title: 'Logged Requests',
      activeHref: '/operator/requests',
      pageTitle: 'Logged Requests',
      pageSubtitle: 'Requests you have recorded on behalf of community members',
      requests,
    });
  } catch (error) {
    next(error);
  }
};

exports.searchExternalRequesters = async (req, res, next) => {
  const searchTerm = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (searchTerm.length < 2) {
    return res.json([]);
  }

  try {
    const requesters = await requestsService.searchExternalRequesters(searchTerm);
    res.json(requesters);
  } catch (error) {
    next(error);
  }
};

exports.submitRequest = async (req, res, next) => {
  try {
    await requestsService.submit(req.body, getAuthenticatedUserId(req));
    res.redirect('/requester/my-requests');
  } catch (error) {
    if (error instanceof requestsService.RequestValidationError) {
      try {
        await submissionView(req, res.status(400), 'requester', {
          errors: error.errors,
          values: req.body,
        });
      } catch (renderError) {
        next(renderError);
      }
      return;
    }
    if (error instanceof requestsService.SubmissionUserNotFoundError) {
      res.status(403).send(error.message);
      return;
    }

    next(error);
  }
};

exports.operatorSubmitRequest = async (req, res, next) => {
  try {
    const created = await requestsService.createServiceRequest({
      input: req.body,
      actorType: 'OPERATOR',
      actorUserId: getAuthenticatedUserId(req),
    });
    res.redirect(`/operator/submit?submitted=${encodeURIComponent(created.reference)}`);
  } catch (error) {
    if (error instanceof requestsService.RequestValidationError) {
      try {
        await submissionView(req, res.status(400), 'operator', {
          errors: error.errors,
          values: req.body,
        });
      } catch (renderError) {
        next(renderError);
      }
      return;
    }
    if (error instanceof requestsService.SubmissionUserNotFoundError) {
      res.status(403).send(error.message);
      return;
    }
    next(error);
  }
};

exports.myRequests = async (req, res, next) => {
  try {
    const requests = await requestsService.listForRequester(getAuthenticatedUserId(req));
    res.render('requests/views/requester/my-requests', {
      ...pageContext('requester', req),
      title: 'My Requests',
      activeHref: '/requester/my-requests',
      pageTitle: 'My Requests',
      pageSubtitle: 'Track the status of your submissions',
      requests,
    });
  } catch (error) {
    next(error);
  }
};

exports.requesterDetail = async (req, res, next) => {
  try {
    const request = await requestsService.getForRequester(
      req.params.id,
      getAuthenticatedUserId(req)
    );
    if (!request) {
      return res.status(404).render('errors/404', { title: 'Not Found' });
    }
    res.render('requests/views/requester/request-detail', {
      ...pageContext('requester', req),
      title: 'Request Details',
      activeHref: '/requester/my-requests',
      pageTitle: 'Request Details',
      pageSubtitle: 'Full request information and timeline',
      request,
    });
  } catch (error) {
    next(error);
  }
};

// ---- staff ----
exports.staffSearch = async (req, res) => {
  res.render('requests/views/staff/search', {
    ...pageContext('staff', req),
    title: 'Search & Filter',
    activeHref: '/staff/search',
    pageTitle: 'Search & Filter',
    pageSubtitle: 'Find requests across all categories',
    requests: await requestsService.listForStaff(getAuthenticatedUserId(req)),
  });
};

exports.staffDetail = async (req, res, next) => {
  try {
    res.render('requests/views/staff/request-detail', {
      ...pageContext('staff', req),
      title: 'Request Details',
      activeHref: '/staff/dashboard',
      pageTitle: 'Request Details',
      pageSubtitle: 'Manage and resolve this request',
      request: await requestsService.getForStaff(req.params.id, getAuthenticatedUserId(req)),
    });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).send(error.message);
    next(error);
  }
};

// ---- manager ----
exports.allRequests = async (req, res) => {
  let data;
  try {
    data = await requestsService.listForManager(getAuthenticatedUserId(req), req.query);
  } catch (error) {
    if (error instanceof requestsService.RequestValidationError) {
      return res.status(400).send(Object.values(error.errors).join(' '));
    }
    throw error;
  }
  if (!data) return res.status(403).send('You do not manage an active department.');
  res.render('requests/views/manager/all-requests', {
    ...pageContext('manager', req),
    title: 'All Requests',
    activeHref: '/manager/requests',
    pageTitle: 'All Requests',
    pageSubtitle: 'Requests for your department',
    ...data,
  });
};

exports.managerDetail = async (req, res, next) => {
  try {
    res.render('requests/views/manager/request-detail', {
      ...pageContext('manager', req),
      title: 'Request Details',
      activeHref: '/manager/requests',
      pageTitle: 'Request Details',
      pageSubtitle: 'Manager view with assignment controls',
      request: await requestsService.getById(req.params.id),
    });
  } catch (error) {
    next(error);
  }
};

const transitionRequest = async (req, res, status, redirectPath) => {
  try {
    await requestsService.workflow.transitionRequest(
      req.params.id,
      status,
      getAuthenticatedUserId(req),
      req.body?.comment || null,
      getAuthenticatedUserRole(req) === 'staff'
    );
    res.redirect(redirectPath(req.params.id));
  } catch (error) {
    res.status(error.statusCode || 400).send(error.message);
  }
};

exports.assignRequest = async (req, res) => {
  try {
    const request = await requestsService.getForStaff(req.params.id, getAuthenticatedUserId(req));
    if (!request.canAssign)
      return res.status(403).send('This request is not available for assignment.');
    await require('../workflow/workflow.service').assignToSelf(
      req.params.id,
      getAuthenticatedUserId(req)
    );
    res.redirect(`/staff/requests/${req.params.id}`);
  } catch (error) {
    res.status(error.statusCode || 400).send(error.message);
  }
};

exports.startProgress = (req, res) =>
  transitionRequest(req, res, REQUEST_STATUSES.IN_PROGRESS, (id) => `/staff/requests/${id}`);

exports.resolveRequest = (req, res) =>
  transitionRequest(req, res, REQUEST_STATUSES.RESOLVED, (id) => `/staff/requests/${id}`);

exports.rejectRequest = (req, res) =>
  transitionRequest(req, res, REQUEST_STATUSES.REJECTED, (id) => `/staff/requests/${id}`);

exports.closeRequest = (req, res) =>
  transitionRequest(req, res, REQUEST_STATUSES.CLOSED, (id) => `/manager/requests/${id}`);
