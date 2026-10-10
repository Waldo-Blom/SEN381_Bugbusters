const router = require('express').Router();
const c = require('./requests.controller');

// requester
router.get('/requester/submit', c.submitPage);
router.get('/requester/my-requests', c.myRequests);
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
