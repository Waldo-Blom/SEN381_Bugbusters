const requestsService = require('./requests.service');
const { pageContext } = require('../../shared/views/pageContext');

// ---- requester ----
const submissionView = async (res, role, options = {}) => {
  const isOperator = role === 'operator';
  const submitPath = isOperator ? '/operator/submit' : '/requester/submit';
  const categories = await requestsService.listCategories();
  res.render('requests/views/requester/submit', {
    ...pageContext(role),
    title: isOperator ? 'Log a Request' : 'Submit a Request',
    activeHref: submitPath,
    pageTitle: isOperator ? 'Log a Request' : 'Submit a Request',
    pageSubtitle: isOperator
      ? 'Log a community member’s request'
      : 'Report an issue in your community',
    categories,
    errors: {},
    values: {},
    isOperator,
    formAction: submitPath,
    successReference: null,
    ...options,
  });
};

exports.submitPage = async (req, res, next) => {
  try {
    await submissionView(res, 'requester');
  } catch (error) {
    next(error);
  }
};

exports.operatorSubmitPage = async (req, res, next) => {
  try {
    await submissionView(res, 'operator', {
      successReference: req.query.submitted || null,
    });
  } catch (error) {
    next(error);
  }
};

exports.submitRequest = async (req, res, next) => {
  try {
    await requestsService.submit(req.session.user.email, req.body);
    res.redirect('/requester/my-requests');
  } catch (error) {
    if (error instanceof requestsService.RequestValidationError) {
      try {
        await submissionView(res.status(400), 'requester', {
          errors: error.errors,
          values: req.body,
        });
      } catch (renderError) {
        next(renderError);
      }
      return;
    }
    if (error instanceof requestsService.RequesterAccountNotFoundError) {
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
      actorEmail: req.session.user.email,
      actorType: 'OPERATOR',
      submissionChannel: req.body.submissionChannel,
    });
    res.redirect(`/operator/submit?submitted=${encodeURIComponent(created.reference)}`);
  } catch (error) {
    if (error instanceof requestsService.RequestValidationError) {
      try {
        await submissionView(res.status(400), 'operator', {
          errors: error.errors,
          values: req.body,
        });
      } catch (renderError) {
        next(renderError);
      }
      return;
    }
    if (error instanceof requestsService.RequesterAccountNotFoundError) {
      res.status(403).send(error.message);
      return;
    }
    next(error);
  }
};

exports.myRequests = async (req, res, next) => {
  try {
    const requests = await requestsService.listForRequester(req.session.user.email);
    res.render('requests/views/requester/my-requests', {
      ...pageContext('requester'),
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
    res.render('requests/views/requester/request-detail', {
      ...pageContext('requester'),
      title: 'Request Details',
      activeHref: '/requester/my-requests',
      pageTitle: 'Request Details',
      pageSubtitle: 'Full request information and timeline',
      request: await requestsService.getById(req.params.id),
    });
  } catch (error) {
    next(error);
  }
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

exports.staffDetail = async (req, res, next) => {
  try {
    res.render('requests/views/staff/request-detail', {
      ...pageContext('staff'),
      title: 'Request Details',
      activeHref: '/staff/dashboard',
      pageTitle: 'Request Details',
      pageSubtitle: 'Manage and resolve this request',
      request: await requestsService.getById(req.params.id),
    });
  } catch (error) {
    next(error);
  }
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

exports.managerDetail = async (req, res, next) => {
  try {
    res.render('requests/views/manager/request-detail', {
      ...pageContext('manager'),
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

exports.resolveRequest = (req, res) => {
  const requestId = req.params.id;
  const { comment } = req.body;
  const staffId = req.user?.id || 'staff-1'; // Mocked auth
  try {
    requestsService.workflow.transitionRequest(requestId, 'Resolved', staffId, comment);
    res.redirect(`/staff/requests/${requestId}`);
  } catch (error) {
    res.status(400).send(error.message);
  }
};

exports.closeRequest = (req, res) => {
  const requestId = req.params.id;
  const managerId = req.user?.id || 'manager-1'; // Mocked auth
  try {
    requestsService.workflow.transitionRequest(requestId, 'Closed', managerId);
    res.redirect(`/manager/requests/${requestId}`);
  } catch (error) {
    res.status(400).send(error.message);
  }
};
