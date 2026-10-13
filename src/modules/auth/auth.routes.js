const router = require('express').Router();
const authController = require('./auth.controller');
const { validate } = require('../../shared/middleware/validate.middleware');
const { validateLogin, validateRegistration } = require('./auth.schema');

router.get('/login', authController.loginPage);
router.post('/login', validate(validateLogin, { throwOnError: false }), authController.login);
router.get('/register', authController.registerPage);
router.post(
  '/register',
  validate(validateRegistration, { throwOnError: false }),
  authController.register
);
router.get('/password-reset', authController.passwordResetPage);
router.post('/logout', authController.logout);

module.exports = router;
