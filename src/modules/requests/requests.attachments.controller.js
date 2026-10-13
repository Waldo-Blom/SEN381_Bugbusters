const service = require('./requests.attachments.service');
const { getAuthenticatedUserId, getAuthenticatedUserRole } = require('../auth/auth.middleware');
const { sendHttpError } = require('../../shared/middleware/error.middleware');

const action = (operation) => async (req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  res.set('Referrer-Policy', 'no-referrer');
  try {
    await operation(req, res);
  } catch (error) {
    if (error.statusCode) return sendHttpError(req, res, error.statusCode, error.message);
    next(error);
  }
};

exports.list = action(async (req, res) => {
  const images = await service.list(
    req.params.id,
    getAuthenticatedUserId(req),
    getAuthenticatedUserRole(req)
  );
  res.json(
    images.map((image) => ({ ...image, url: `/requests/${req.params.id}/attachments/${image.id}` }))
  );
});
exports.view = action(async (req, res) => {
  const url = await service.downloadUrl(
    req.params.id,
    req.params.attachmentId,
    getAuthenticatedUserId(req),
    getAuthenticatedUserRole(req)
  );
  res.redirect(url);
});
exports.upload = action(async (req, res) => {
  if (req.attachmentError) throw req.attachmentError;
  await service.add(
    req.params.id,
    getAuthenticatedUserId(req),
    req.files || [],
    getAuthenticatedUserRole(req)
  );
  const role = getAuthenticatedUserRole(req);
  res.redirect(`/${role === 'operator' ? 'operator' : 'requester'}/requests/${req.params.id}`);
});

exports.operatorDetail = action(async (req, res) => {
  const id = getAuthenticatedUserId(req);
  await service.list(req.params.id, id, getAuthenticatedUserRole(req));
  const request = await require('./requests.service').getById(req.params.id);
  if (!request) return sendHttpError(req, res, 404, 'Request not found.');
  const { pageContext } = require('../../shared/views/pageContext');
  const { getCsrfToken } = require('../../shared/middleware/csrf.middleware');
  res.render('requests/views/requester/request-detail', {
    ...pageContext('operator', req),
    title: 'Request Details',
    activeHref: '/operator/requests',
    pageTitle: 'Request Details',
    pageSubtitle: 'Your logged request and images',
    request,
    backHref: '/operator/requests',
    attachmentCsrfToken: getCsrfToken(req),
  });
});
