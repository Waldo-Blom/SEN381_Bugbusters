const { mockUsers } = require('../data/mockData');

exports.loginPage = (req, res) => {
  res.render('pages/auth/login', { title: 'Sign in' });
};

exports.registerPage = (req, res) => {
  res.render('pages/auth/register', { title: 'Create Account' });
};

exports.passwordResetPage = (req, res) => {
  res.render('pages/auth/password-reset', { title: 'Reset Password' });
};

// POST /auth/login  — mock login using the role field on the form
exports.login = (req, res) => {
  const role = req.body.role || 'requester';
  req.session.user = mockUsers[role];
  if (role === 'staff')    return res.redirect('/staff/dashboard');
  if (role === 'management') return res.redirect('/manager/dashboard');
  return res.redirect('/requester/my-requests');
};

// GET /auth/logout
exports.logout = (req, res) => {
  req.session.destroy(() => res.redirect('/'));
};