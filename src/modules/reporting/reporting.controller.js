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

exports.reporting = (req, res) => {
  res.render('reporting/views/manager/reporting', {
    ...pageContext('manager', req),
    title: 'Reporting & Audit',
    activeHref: '/manager/reporting',
    pageTitle: 'Reporting & Audit',
    pageSubtitle: 'Request lifecycle and action history',
    auditLog: reportingService.getAuditLog(),
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
