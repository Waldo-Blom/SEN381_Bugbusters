const router = require('express').Router();
const c = require('./users.controller');

router.get('/manager/users', c.staffList);
router.get('/requester/settings', c.settings);

module.exports = router;
