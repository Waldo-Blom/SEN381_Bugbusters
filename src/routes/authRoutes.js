const router = require('express').Router();
const authController = require('../controllers/authController');

router.get('/login', authController.loginPage);
router.post('/login', authController.login);
router.get('/register', authController.registerPage);
router.get('/password-reset', authController.passwordResetPage);
router.get('/logout', authController.logout);

module.exports = router;
