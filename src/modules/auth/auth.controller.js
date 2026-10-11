const authService = require('./auth.service');
const { validateLogin, validateRegistration } = require('./auth.schema');

const redirectByRole = {
  requester: '/requester/my-requests',
  staff: '/staff/dashboard',
  management: '/manager/requests',
  operator: '/operator/submit',
  admin: '/',
};

const demoRoles = [
  { role: 'requester', label: 'Requester', envPrefix: 'REQUESTER' },
  { role: 'staff', label: 'Staff', envPrefix: 'STAFF' },
  { role: 'management', label: 'Management', envPrefix: 'MANAGEMENT' },
  { role: 'operator', label: 'Operator', envPrefix: 'OPERATOR' },
  { role: 'admin', label: 'Admin', envPrefix: 'ADMIN' },
];

const isDemoLoginEnabled = () =>
  ['development', 'test'].includes(process.env.NODE_ENV) &&
  process.env.ENABLE_DEMO_LOGINS === 'true';

const getDemoRolesForEnvironment = () => (isDemoLoginEnabled() ? demoRoles : []);

const getConfiguredDemoCredentials = (role) => {
  const configuredRole = demoRoles.find((item) => item.role === role);
  if (!configuredRole) {
    return null;
  }

  const email = process.env[`${configuredRole.envPrefix}_EMAIL`]?.trim().toLowerCase();
  const password = process.env[`${configuredRole.envPrefix}_PASSWORD`];
  return email && password ? { email, password } : null;
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
    demoRoles: getDemoRolesForEnvironment(),
    demoLoginsEnabled: isDemoLoginEnabled(),
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
  const { errors, values } = validateRegistration(req.body);
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
  if (req.body.demoRole !== undefined) {
    if (!isDemoLoginEnabled()) {
      return res.status(404).send('Not Found');
    }

    const credentials = getConfiguredDemoCredentials(req.body.demoRole);
    if (!credentials) {
      return res.status(400).render('auth/views/login', {
        title: 'Sign in',
        error: 'Demo login is not configured for that role.',
        values: {},
        demoRoles: getDemoRolesForEnvironment(),
        demoLoginsEnabled: true,
      });
    }

    const authenticatedUser = await authService.authenticate(
      credentials.email,
      credentials.password
    );
    const expectedRole = req.body.demoRole;
    const isOperatorAccount =
      expectedRole === 'operator' && ['staff', 'admin'].includes(authenticatedUser?.role);
    if (!authenticatedUser || (authenticatedUser.role !== expectedRole && !isOperatorAccount)) {
      return res.status(401).render('auth/views/login', {
        title: 'Sign in',
        error: 'The configured demo account is unavailable or does not match that role.',
        values: {},
        demoRoles: getDemoRolesForEnvironment(),
        demoLoginsEnabled: true,
      });
    }

    const user =
      expectedRole === 'operator' ? { ...authenticatedUser, role: 'operator' } : authenticatedUser;
    await renewSession(req, user);
    return res.redirect(redirectByRole[user.role] || '/');
  }

  const { errors, values } = validateLogin(req.body);
  if (errors.length) {
    return res.status(400).render('auth/views/login', {
      title: 'Sign in',
      error: errors[0],
      values,
      demoRoles: getDemoRolesForEnvironment(),
      demoLoginsEnabled: isDemoLoginEnabled(),
    });
  }

  // Look up the active database account and verify its bcrypt hash before creating a session.
  const user = await authService.authenticate(values.email, values.password);
  if (!user) {
    return res.status(401).render('auth/views/login', {
      title: 'Sign in',
      error: 'Email or password is incorrect.',
      values: { email: values.email },
      demoRoles: getDemoRolesForEnvironment(),
      demoLoginsEnabled: isDemoLoginEnabled(),
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
