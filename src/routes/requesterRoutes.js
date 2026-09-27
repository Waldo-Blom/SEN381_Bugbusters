const router = require('express').Router();
const requesterController = require('../controllers/requesterController');

router.get('/submit',          requesterController.submitPage);
router.get('/my-requests',     requesterController.myRequests);
router.get('/requests/:id',    requesterController.requestDetail);
router.get('/settings',        requesterController.settings);

module.exports = router;