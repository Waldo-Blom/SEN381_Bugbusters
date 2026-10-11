const router = require('express').Router();
const c = require('./reporting.controller');
const { requireRole } = require('../auth/auth.middleware');

router.get('/manager/dashboard', requireRole('management'), c.dashboard);
router.get('/manager/contact-access-requests', requireRole('management'), c.contactAccessRequests);
router.get('/manager/reporting', c.reporting);

module.exports = router;
