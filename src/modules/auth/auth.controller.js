const authService = require('./auth.service');

exports.loginPage = (req, res) => {
  res.render('auth/views/login', { title: 'Sign in' });
};

exports.registerPage = (req, res) => {
  res.render('auth/views/register', { title: 'Create Account' });
};

exports.passwordResetPage = (req, res) => {
  res.render('auth/views/password-reset', { title: 'Reset Password' });
};

// POST /auth/login  — mock login using the role field on the form
exports.login = (req, res) => {
  const { user, redirectTo } = authService.mockLogin(req.body.role);
  req.session.user = user;
  res.redirect(redirectTo);
};

// GET /auth/logout
exports.logout = (req, res) => {
  req.session.destroy(() => res.redirect('/'));
};
