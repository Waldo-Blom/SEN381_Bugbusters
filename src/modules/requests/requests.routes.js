const router = require('express').Router();
const c = require('./requests.controller');
const { requireRole } = require('../auth/auth.middleware');
const { requireCsrf } = require('../../shared/middleware/csrf.middleware');
const attachments = require('./requests.attachments.controller');
const { parseImages } = require('./requests.attachments.middleware');
const requireUploadCsrf = (req, res, next) =>
  req.is('multipart/form-data') ? requireCsrf(req, res, next) : next();
const requireAttachmentViewer = requireRole(['requester', 'operator', 'staff', 'management']);
const requireAttachmentUploader = requireRole(['requester', 'operator']);

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
router.post('/requester/submit', requireRequester, parseImages, requireUploadCsrf, c.submitRequest);
router.get('/requester/my-requests', requireRequester, c.myRequests);
router.get('/requester/requests/:id', requireRequester, c.requesterDetail);
router.get('/requester/requests/:id/edit', requireRequester, c.editRequestPage);
router.post(
  '/requester/requests/:id/edit',
  requireRequester,
  parseImages,
  requireUploadCsrf,
  c.updateRequest
);

// operators are limited to creating requests on behalf of external requesters
router.get('/operator/submit', requireOperator, c.operatorSubmitPage);
router.post(
  '/operator/submit',
  requireOperator,
  parseImages,
  requireUploadCsrf,
  c.operatorSubmitRequest
);
router.get('/operator/requests', requireOperator, c.operatorLoggedRequests);
router.get('/operator/requests/:id', requireOperator, attachments.operatorDetail);
router.get('/operator/community-members/search', requireOperator, c.searchExternalRequesters);

router.get('/requests/:id/attachments', requireAttachmentViewer, attachments.list);
router.get('/requests/:id/attachments/:attachmentId', requireAttachmentViewer, attachments.view);
router.post(
  '/requests/:id/attachments',
  requireAttachmentUploader,
  parseImages,
  requireCsrf,
  attachments.upload
);

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
router.post('/staff/requests/:id/comment', requireStaff, c.addStaffComment);
router.post('/staff/requests/:id/comments', requireStaff, c.addStaffComment);
router.post('/manager/requests/:id/close', requireManager, c.closeRequest);
router.post('/manager/requests/:id/comment', requireManager, c.addManagerComment);
router.post('/manager/requests/:id/comments', requireManager, c.addManagerComment);
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
