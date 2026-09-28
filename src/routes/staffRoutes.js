const router = require('express').Router();
const staffController = require('../controllers/staffController');

router.get('/dashboard',       staffController.dashboard);
router.get('/search',          staffController.search);
router.get('/requests/:id',    staffController.requestDetail);

module.exports = router;