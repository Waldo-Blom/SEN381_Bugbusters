const router = require('express').Router();
const c = require('./workflow.controller');
const { requireRole } = require('../auth/auth.middleware');

router.get(
  '/staff/dashboard',
  requireRole('staff', 'Only staff can access this page.'),
  c.dashboard
);

module.exports = router;
