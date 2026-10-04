const router = require('express').Router();
const c = require('./reporting.controller');

router.get('/manager/dashboard', c.dashboard);
router.get('/manager/reporting', c.reporting);

module.exports = router;
