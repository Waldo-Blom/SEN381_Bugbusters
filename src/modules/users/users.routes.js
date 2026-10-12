const router = require('express').Router();
const c = require('./users.controller');
const { requireManager, requireRole } = require('../auth/auth.middleware');
const { requireCsrf } = require('../../shared/middleware/csrf.middleware');

router.get('/manager/users', requireManager, c.staffList);
router.post('/manager/users', requireManager, requireCsrf, c.createStaff);
router.post('/manager/users/:staffId/deactivate', requireManager, requireCsrf, c.deactivateStaff);
router.post('/manager/users/:staffId/activate', requireManager, requireCsrf, c.reactivateStaff);
router.get('/admin/users', requireRole('admin'), c.adminUsers);
router.get('/admin/users/create', requireRole('admin'), c.createManagerPage);
router.post('/admin/users', requireRole('admin'), requireCsrf, c.createManager);
router.get('/admin/departments/create', requireRole('admin'), c.createDepartmentPage);
router.post('/admin/departments', requireRole('admin'), requireCsrf, c.createDepartment);
router.post('/admin/users/:userId/deactivate', requireRole('admin'), requireCsrf, c.deactivateUser);
router.post('/admin/users/:userId/activate', requireRole('admin'), requireCsrf, c.reactivateUser);
router.get('/requester/settings', c.settings);

module.exports = router;
