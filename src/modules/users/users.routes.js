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
router.get('/admin/departments', requireRole('admin'), c.adminDepartments);
router.get('/admin/departments/create', requireRole('admin'), c.createDepartmentPage);
router.post('/admin/departments', requireRole('admin'), requireCsrf, c.createDepartment);
router.get('/admin/categories', requireRole('admin'), c.adminCategories);
router.post('/admin/categories', requireRole('admin'), requireCsrf, c.createRequestCategory);
router.post(
  '/admin/categories/:categoryId/deactivate',
  requireRole('admin'),
  requireCsrf,
  c.deactivateRequestCategory
);
router.post(
  '/admin/categories/:categoryId/activate',
  requireRole('admin'),
  requireCsrf,
  c.reactivateRequestCategory
);
router.post('/admin/users/:userId/deactivate', requireRole('admin'), requireCsrf, c.deactivateUser);
router.post('/admin/users/:userId/activate', requireRole('admin'), requireCsrf, c.reactivateUser);
router.get('/requester/settings', requireRole('requester'), c.settings);
router.post(
  '/requester/settings/profile',
  requireRole('requester'),
  requireCsrf,
  c.updateRequesterProfile
);
router.post(
  '/requester/settings/notifications',
  requireRole('requester'),
  requireCsrf,
  c.updateRequesterNotifications
);

module.exports = router;
