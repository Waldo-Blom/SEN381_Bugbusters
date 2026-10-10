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

// requester
router.get('/requester/submit', c.submitPage);
router.post('/requester/submit', requireRequester, c.submitRequest);
router.get('/requester/my-requests', requireRequester, c.myRequests);
router.get('/requester/requests/:id', c.requesterDetail);

// staff
router.get('/staff/search', c.staffSearch);
router.get('/staff/requests/:id', c.staffDetail);

// manager
router.get('/manager/requests', c.allRequests);
router.get('/manager/requests/:id', c.managerDetail);

// workflow actions
router.post('/staff/requests/:id/resolve', c.resolveRequest);
router.post('/manager/requests/:id/close', c.closeRequest);

module.exports = router;
