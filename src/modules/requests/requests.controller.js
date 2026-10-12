const requestsService = require('./requests.service');
const { REQUEST_STATUSES } = require('./requests.constants');
const { pageContext } = require('../../shared/views/pageContext');
const { getAuthenticatedUserId, getAuthenticatedUserRole } = require('../auth/auth.middleware');
const { getCsrfToken } = require('../../shared/middleware/csrf.middleware');

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
    const userId = getAuthenticatedUserId(req);
    const submissionKey = `${userId}:${req.body?.categoryId}:${req.body?.title}:${req.body?.location}`;
    const now = Date.now();
    if (
      req.session?.lastSubmission &&
      req.session.lastSubmission.key === submissionKey &&
      now - req.session.lastSubmission.time < 3000
    ) {
      return res.redirect('/requester/my-requests');
    }
    if (req.session) {
      req.session.lastSubmission = { key: submissionKey, time: now };
    }

    await requestsService.submit(req.body, userId);
    res.redirect('/requester/my-requests');
  } catch (error) {
    if (req.session) {
      delete req.session.lastSubmission;
    }
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
    const operatorId = getAuthenticatedUserId(req);
    const submissionKey = `${operatorId}:${req.body?.categoryId}:${req.body?.title}:${req.body?.location}:${req.body?.externalRequesterId || ''}`;
    const now = Date.now();
    if (
      req.session?.lastOperatorSubmission &&
      req.session.lastOperatorSubmission.key === submissionKey &&
      now - req.session.lastOperatorSubmission.time < 3000
    ) {
      const ref = req.session.lastOperatorSubmission.reference;
      return res.redirect(
        ref ? `/operator/submit?submitted=${encodeURIComponent(ref)}` : '/operator/requests'
      );
    }

    const created = await requestsService.createServiceRequest({
      input: req.body,
      actorType: 'OPERATOR',
      actorUserId: operatorId,
    });
    if (req.session) {
      req.session.lastOperatorSubmission = {
        key: submissionKey,
        time: now,
        reference: created.reference,
      };
    }
    res.redirect(`/operator/submit?submitted=${encodeURIComponent(created.reference)}`);
  } catch (error) {
    if (req.session) {
      delete req.session.lastOperatorSubmission;
    }
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
    const requesterId = getAuthenticatedUserId(req);
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : 'All';
    const hasFilter = Boolean(q || (status && status.toLowerCase() !== 'all'));
    const filters = { q, status };

    const requests = await requestsService.listForRequester(
      requesterId,
      hasFilter ? filters : undefined
    );

    let summaryCounts = null;
    if (typeof requestsService.getRequesterSummaryCounts === 'function') {
      try {
        summaryCounts = await requestsService.getRequesterSummaryCounts(requesterId);
      } catch {
        summaryCounts = null;
      }
    }

    res.render('requests/views/requester/my-requests', {
      ...pageContext('requester', req),
      title: 'My Requests',
      activeHref: '/requester/my-requests',
      pageTitle: 'My Requests',
      pageSubtitle: 'Track the status of your submissions',
      requests,
      filters,
      summaryCounts,
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
// FR-203 search/filter/sort, kept from the department-access branch.
exports.staffSearch = async (req, res) => {
  const staffUserId = getAuthenticatedUserId(req);
  const usersService = require('../users/users.service');
  const staffDept = await usersService.getStaffDepartment(staffUserId);
  const departmentId = staffDept?.departmentId || null;

  const filters = {
    q: req.query.q || '',
    status: req.query.status || 'All',
    category: req.query.category || 'All',
    priority: req.query.priority || 'All',
    sort: req.query.sort || 'date',
    tab: req.query.tab || 'all',
  };

  const requests = await requestsService.searchStaffRequests({
    staffUserId,
    departmentId,
    ...filters,
  });

  const categories = await requestsService.listCategoriesByDepartment(departmentId);

  res.render('requests/views/staff/search', {
    ...pageContext('staff', req),
    title: 'Search & Filter',
    activeHref: '/staff/search',
    pageTitle: 'Search & Filter',
    pageSubtitle: staffDept
      ? `Showing requests for ${staffDept.departmentName} Department`
      : 'Find requests across all categories',
    requests,
    filters,
    categories,
    departmentName: staffDept?.departmentName || '',
  });
};

exports.staffDetail = async (req, res, next) => {
  try {
    const staffUserId = getAuthenticatedUserId(req);
    const request = await requestsService.getForStaff(req.params.id, staffUserId);
    if (!request) {
      return res.status(404).render('errors/404', { title: 'Request Details' });
    }
    // Contact details may be revealed after approval, so never cache this page.
    res.set('Cache-Control', 'no-store');
    res.render('requests/views/staff/request-detail', {
      ...pageContext('staff', req),
      title: 'Request Details',
      activeHref: '/staff/dashboard',
      pageTitle: 'Request Details',
      pageSubtitle: 'Manage and resolve this request',
      request,
      contactAccessCsrfToken: getCsrfToken(req),
    });
  } catch (error) {
    if (error.statusCode === 403 || error.name === 'StaffDepartmentAccessError') {
      return res.status(403).send(error.message);
    }
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
    res.set('Cache-Control', 'no-store');
    res.render('requests/views/manager/request-detail', {
      ...pageContext('manager', req),
      title: 'Request Details',
      activeHref: '/manager/requests',
      pageTitle: 'Request Details',
      pageSubtitle: 'Manager view with assignment controls',
      request: await requestsService.getForManager(req.params.id, getAuthenticatedUserId(req)),
      contactAccessCsrfToken: getCsrfToken(req),
    });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).send(error.message);
    next(error);
  }
};

const contactAction = async (req, res, next, operation, destination) => {
  try {
    await operation();
    res.redirect(destination);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).send(error.message);
    next(error);
  }
};

exports.requestContactAccess = (req, res, next) =>
  contactAction(
    req,
    res,
    next,
    () =>
      requestsService.contactAccess.requestAccess(
        req.params.id,
        getAuthenticatedUserId(req),
        req.body?.reason
      ),
    `/staff/requests/${req.params.id}`
  );
exports.approveContactAccess = (req, res, next) =>
  contactAction(
    req,
    res,
    next,
    () =>
      requestsService.contactAccess.reviewAccess(
        req.params.accessId,
        getAuthenticatedUserId(req),
        true
      ),
    '/manager/contact-access-requests'
  );
exports.rejectContactAccess = (req, res, next) =>
  contactAction(
    req,
    res,
    next,
    () =>
      requestsService.contactAccess.reviewAccess(
        req.params.accessId,
        getAuthenticatedUserId(req),
        false
      ),
    '/manager/contact-access-requests'
  );
exports.authoriseContactAccess = (req, res, next) =>
  contactAction(
    req,
    res,
    next,
    () =>
      requestsService.contactAccess.changeApproval(
        req.params.id,
        getAuthenticatedUserId(req),
        true
      ),
    `/manager/requests/${req.params.id}`
  );
exports.revokeContactAccess = (req, res, next) =>
  contactAction(
    req,
    res,
    next,
    () =>
      requestsService.contactAccess.changeApproval(
        req.params.id,
        getAuthenticatedUserId(req),
        false
      ),
    `/manager/requests/${req.params.id}`
  );

const errorStatus = (error) =>
  error.statusCode || (error.name === 'StaffDepartmentAccessError' ? 403 : 400);

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
    res.status(errorStatus(error)).send(error.message);
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
    res.status(errorStatus(error)).send(error.message);
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

exports.addStaffComment = async (req, res, next) => {
  try {
    const staffUserId = getAuthenticatedUserId(req);
    const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim() : '';
    if (!comment) {
      return res.redirect(`/staff/requests/${req.params.id}`);
    }
    await requestsService.addStaffComment(req.params.id, staffUserId, comment);
    res.redirect(`/staff/requests/${req.params.id}`);
  } catch (error) {
    if (error.statusCode === 403 || error.name === 'StaffDepartmentAccessError') {
      return res.status(403).send(error.message);
    }
    if (error.statusCode) return res.status(error.statusCode).send(error.message);
    next(error);
  }
};

exports.addManagerComment = async (req, res, next) => {
  try {
    const managerUserId = getAuthenticatedUserId(req);
    const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim() : '';
    if (!comment) {
      return res.redirect(`/manager/requests/${req.params.id}`);
    }
    await requestsService.addManagerComment(req.params.id, managerUserId, comment);
    res.redirect(`/manager/requests/${req.params.id}`);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).send(error.message);
    next(error);
  }
};
