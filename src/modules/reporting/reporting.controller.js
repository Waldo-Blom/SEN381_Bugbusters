const reportingService = require('./reporting.service');
const { pageContext } = require('../../shared/views/pageContext');
const { getAuthenticatedUserId } = require('../auth/auth.middleware');
const { getCsrfToken } = require('../../shared/middleware/csrf.middleware');

exports.dashboard = async (req, res) => {
  const data = await reportingService.getDashboardData(getAuthenticatedUserId(req));
  if (!data) {
    return res.status(403).send('You do not manage an active department.');
  }
  res.render('reporting/views/manager/dashboard', {
    ...pageContext('manager', req),
    title: 'Management Dashboard',
    activeHref: '/manager/dashboard',
    pageTitle: 'Management Dashboard',
    pageSubtitle: 'Operational overview and metrics',
    ...data,
  });
};

exports.reporting = async (req, res) => {
  const managerId = getAuthenticatedUserId(req);
  const reportingModel = require('./reporting.model');
  const department = await reportingModel.findManagedDepartment(managerId);
  if (!department) {
    return res.status(403).send('You do not manage an active department.');
  }
  const requestedPage = Number(req.query.page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const {
    entries: auditLog,
    totalCount,
    page: currentPage,
    totalPages,
  } = await reportingService.getAuditLog(managerId, department.id, page);
  res.render('reporting/views/manager/reporting', {
    ...pageContext('manager', req),
    title: 'Reporting & Audit',
    activeHref: '/manager/reporting',
    pageTitle: 'Reporting & Audit',
    pageSubtitle: 'Request lifecycle and action history',
    auditLog,
    totalCount,
    currentPage,
    totalPages,
  });
};

exports.contactAccessRequests = async (req, res) => {
  const data = await reportingService.getContactAccessInbox(getAuthenticatedUserId(req));
  if (!data) {
    return res.status(403).send('You do not manage an active department.');
  }
  res.set('Cache-Control', 'no-store');
  res.render('reporting/views/manager/contact-access-requests', {
    ...pageContext('manager', req),
    title: 'Contact Access Requests',
    activeHref: '/manager/contact-access-requests',
    pageTitle: 'Contact Access Requests',
    pageSubtitle: 'Review staff requests for requester contact information',
    contactAccessCsrfToken: getCsrfToken(req),
    ...data,
  });
};
