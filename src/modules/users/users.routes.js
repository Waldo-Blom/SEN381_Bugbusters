const router = require('express').Router();
const c = require('./users.controller');
const { requireManager } = require('../auth/auth.middleware');
const { requireCsrf } = require('../../shared/middleware/csrf.middleware');

router.get('/manager/users', requireManager, c.staffList);
router.post('/manager/users', requireManager, requireCsrf, c.createStaff);
router.post('/manager/users/:staffId/deactivate', requireManager, requireCsrf, c.deactivateStaff);
router.post('/manager/users/:staffId/activate', requireManager, requireCsrf, c.reactivateStaff);
router.get('/requester/settings', c.settings);

module.exports = router;
