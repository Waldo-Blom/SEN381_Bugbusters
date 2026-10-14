const authService = require('./auth.service');
const { validateLogin, validateRegistration } = require('./auth.schema');

const redirectByRole = {
  requester: '/requester/my-requests',
  staff: '/staff/dashboard',
  management: '/manager/requests',
  operator: '/operator/submit',
  admin: '/admin/users',
};

// Rotate the session ID after authentication to prevent session fixation, then
// store only the signed-in user's identity and authorization context server-side.
const renewSession = (req, user) =>
  new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        reject(error);
        return;
      }
      req.session.user = user;
      resolve();
    });
  });

exports.loginPage = (req, res) => {
  res.render('auth/views/login', {
    title: 'Sign in',
    error: null,
    values: {},
  });
};

exports.registerPage = (req, res) => {
  res.render('auth/views/register', {
    title: 'Create Account',
    error: null,
    values: {},
  });
};

exports.passwordResetPage = (req, res) => {
  res.render('auth/views/password-reset', { title: 'Reset Password' });
};

exports.register = async (req, res) => {
  const { errors, value: values } = req.validation?.body || validateRegistration(req.body);
  if (errors.length) {
    return res.status(400).render('auth/views/register', {
      title: 'Create Account',
      error: errors[0],
      values,
    });
  }

  const user = await authService.createRequester(values);
  if (!user) {
    return res.status(409).render('auth/views/register', {
      title: 'Create Account',
      error: 'An account with this email address already exists.',
      values,
    });
  }

  await renewSession(req, {
    id: user.user_id,
    name: `${user.first_name} ${user.last_name}`,
    email: user.email,
    role: 'requester',
    departmentId: null,
    avatarInitials: `${user.first_name[0]}${user.last_name[0]}`.toUpperCase(),
  });
  return res.redirect(redirectByRole.requester);
};

exports.login = async (req, res) => {
  const { errors, value: values } = req.validation?.body || validateLogin(req.body);
  if (errors.length) {
    return res.status(400).render('auth/views/login', {
      title: 'Sign in',
      error: errors[0],
      values,
    });
  }

  // Look up the active database account and verify its bcrypt hash before creating a session.
  const user = await authService.authenticate(values.email, values.password);
  if (!user) {
    return res.status(401).render('auth/views/login', {
      title: 'Sign in',
      error: 'Email or password is incorrect.',
      values: { email: values.email },
    });
  }

  await renewSession(req, user);
  return res.redirect(redirectByRole[user.role] || '/');
};

exports.logout = (req, res, next) => {
  // Remove the server-side session and expire the browser's session cookie.
  req.session.destroy((error) => {
    if (error) {
      next(error);
      return;
    }
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
};
