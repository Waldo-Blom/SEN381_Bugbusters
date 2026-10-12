const router = require('express').Router();
const c = require('./requests.controller');
const { requireRole } = require('../auth/auth.middleware');
const { requireCsrf } = require('../../shared/middleware/csrf.middleware');

const requireRequester = requireRole(
  'requester',
  'Only authenticated requesters can submit requests.',
  'Please sign in to submit a request.'
);
const requireOperator = requireRole('operator', 'Only authenticated operators can log requests.');
const requireStaff = requireRole('staff', 'Only staff can access this page.');
const requireManager = requireRole('management', 'Only managers can access this page.');

// requester
router.get('/requester/submit', requireRequester, c.submitPage);
router.post('/requester/submit', requireRequester, c.submitRequest);
router.get('/requester/my-requests', requireRequester, c.myRequests);
router.get('/requester/requests/:id', requireRequester, c.requesterDetail);

// operators are limited to creating requests on behalf of external requesters
router.get('/operator/submit', requireOperator, c.operatorSubmitPage);
router.post('/operator/submit', requireOperator, c.operatorSubmitRequest);
router.get('/operator/requests', requireOperator, c.operatorLoggedRequests);
router.get('/operator/community-members/search', requireOperator, c.searchExternalRequesters);

// staff
router.get('/staff/search', requireStaff, c.staffSearch);
router.get('/staff/requests/:id', requireStaff, c.staffDetail);

// manager
router.get('/manager/requests', requireManager, c.allRequests);
router.get('/manager/requests/:id', requireManager, c.managerDetail);
router.post('/manager/requests/:id/assign', requireManager, requireCsrf, c.managerAssign);

// workflow actions
router.post('/staff/requests/:id/assign', requireStaff, c.assignRequest);
router.post('/staff/requests/:id/start-progress', requireStaff, c.startProgress);
router.post('/staff/requests/:id/resolve', requireStaff, c.resolveRequest);
router.post('/staff/requests/:id/reject', requireStaff, c.rejectRequest);
router.post('/manager/requests/:id/close', requireManager, c.closeRequest);
router.post(
  '/staff/requests/:id/contact-access',
  requireStaff,
  requireCsrf,
  c.requestContactAccess
);
router.post(
  '/manager/contact-access-requests/:accessId/approve',
  requireManager,
  requireCsrf,
  c.approveContactAccess
);
router.post(
  '/manager/contact-access-requests/:accessId/reject',
  requireManager,
  requireCsrf,
  c.rejectContactAccess
);
router.post(
  '/manager/requests/:id/contact-access/authorise',
  requireManager,
  requireCsrf,
  c.authoriseContactAccess
);
router.post(
  '/manager/requests/:id/contact-access/revoke',
  requireManager,
  requireCsrf,
  c.revokeContactAccess
);

module.exports = router;
