const router = require('express').Router();
const c = require('./requests.controller');

const requireRequester = (req, res, next) => {
  const user = req.session?.user;
  if (!user) {
    return res.status(401).send('Please sign in to submit a request.');
  }
  if (user.role !== 'requester' || !user.email) {
    return res.status(403).send('Only authenticated requesters can submit requests.');
  }
  next();
};

const requireRole = (role, message) => (req, res, next) => {
  const user = req.session?.user;
  if (!user) {
    return res.status(401).send('Please sign in to continue.');
  }
  if (user.role !== role || !user.email) {
    return res.status(403).send(message);
  }
  next();
};

const requireOperator = requireRole('operator', 'Only authenticated operators can log requests.');
const requireStaff = requireRole('staff', 'Only staff can access this page.');
const requireManager = requireRole('management', 'Only managers can access this page.');

// requester
router.get('/requester/submit', c.submitPage);
router.post('/requester/submit', requireRequester, c.submitRequest);
router.get('/requester/my-requests', requireRequester, c.myRequests);
router.get('/requester/requests/:id', c.requesterDetail);

// operators are limited to creating requests on behalf of external requesters
router.get('/operator/submit', requireOperator, c.operatorSubmitPage);
router.post('/operator/submit', requireOperator, c.operatorSubmitRequest);

// staff
router.get('/staff/search', requireStaff, c.staffSearch);
router.get('/staff/requests/:id', requireStaff, c.staffDetail);

// manager
router.get('/manager/requests', requireManager, c.allRequests);
router.get('/manager/requests/:id', requireManager, c.managerDetail);

// workflow actions
router.post('/staff/requests/:id/resolve', requireStaff, c.resolveRequest);
router.post('/manager/requests/:id/close', requireManager, c.closeRequest);

module.exports = router;
