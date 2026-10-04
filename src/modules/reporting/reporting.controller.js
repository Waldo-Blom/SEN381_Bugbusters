const reportingService = require('./reporting.service');
const { pageContext } = require('../../shared/views/pageContext');

exports.dashboard = (req, res) => {
  res.render('reporting/views/manager/dashboard', {
    ...pageContext('manager'),
    title: 'Management Dashboard',
    activeHref: '/manager/dashboard',
    pageTitle: 'Management Dashboard',
    pageSubtitle: 'Operational overview and metrics',
    ...reportingService.getDashboardData(),
  });
};

exports.reporting = (req, res) => {
  res.render('reporting/views/manager/reporting', {
    ...pageContext('manager'),
    title: 'Reporting & Audit',
    activeHref: '/manager/reporting',
    pageTitle: 'Reporting & Audit',
    pageSubtitle: 'Request lifecycle and action history',
    auditLog: reportingService.getAuditLog(),
  });
};
