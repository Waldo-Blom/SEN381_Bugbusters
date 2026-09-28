const router = require('express').Router();
const managerController = require('../controllers/managerController');

router.get('/dashboard', managerController.dashboard);
router.get('/requests', managerController.allRequests);
router.get('/requests/:id', managerController.requestDetail);
router.get('/reporting', managerController.reporting);
router.get('/users', managerController.users);

module.exports = router;
