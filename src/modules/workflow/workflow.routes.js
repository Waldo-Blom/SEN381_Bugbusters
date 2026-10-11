const router = require('express').Router();
const c = require('./workflow.controller');
const { requireRole } = require('../auth/auth.middleware');

const requireStaff = requireRole('staff', 'Only staff can access this page.');

router.get('/staff/dashboard', requireStaff, c.dashboard);
router.post('/staff/requests/:id/assign', requireStaff, c.assignRequest);

module.exports = router;
