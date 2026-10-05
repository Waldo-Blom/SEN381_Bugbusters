const router = require('express').Router();
const c = require('./workflow.controller');

router.get('/staff/dashboard', c.dashboard);

module.exports = router;
