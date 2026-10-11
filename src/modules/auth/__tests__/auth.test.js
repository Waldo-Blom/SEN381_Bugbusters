jest.mock('../../../config/database', () => ({
  query: jest.fn(),
}));

const path = require('path');
const ejs = require('ejs');
const bcrypt = require('bcrypt');
const express = require('express');
const session = require('express-session');
const request = require('supertest');
const { query } = require('../../../config/database');
const authService = require('../auth.service');
const authRoutes = require('../auth.routes');
const {
  getAuthenticatedUser,
  getAuthenticatedUserId,
  getAuthenticatedUserRole,
  requireAuth,
  requireRole,
  requireDepartment,
} = require('../auth.middleware');
const workflowRoutes = require('../../workflow/workflow.routes');
const { pageContext } = require('../../../shared/views/pageContext');

const app = express();
app.set('view engine', 'ejs');
app.set('views', [path.join(__dirname, '../..'), path.join(__dirname, '../../../shared/views')]);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  session({
    secret: 'test-session-secret',
    resave: false,
    saveUninitialized: false,
  })
);
app.use('/auth', authRoutes);
app.use(workflowRoutes);
app.get('/protected', requireAuth, (req, res) => res.send('authenticated'));
app.get('/staff-only', requireRole('staff'), (req, res) => res.send('staff'));
app.get('/department-only', requireDepartment('department-1'), (req, res) =>
  res.send('department')
);

const demoEnvKeys = [
  'NODE_ENV',
  'ENABLE_DEMO_LOGINS',
  'REQUESTER_EMAIL',
  'REQUESTER_PASSWORD',
  'STAFF_EMAIL',
  'STAFF_PASSWORD',
  'MANAGEMENT_EMAIL',
  'MANAGEMENT_PASSWORD',
  'OPERATOR_EMAIL',
  'OPERATOR_PASSWORD',
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD',
];
let previousDemoEnv;

describe('Requester authentication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    previousDemoEnv = Object.fromEntries(demoEnvKeys.map((key) => [key, process.env[key]]));
  });

  afterEach(() => {
    demoEnvKeys.forEach((key) => {
      if (previousDemoEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousDemoEnv[key];
      }
    });
  });

  it('provides shared helpers for authenticated session identity', () => {
    const user = { id: 'requester-1', role: 'requester' };
    const req = { session: { user } };

    expect(getAuthenticatedUser(req)).toBe(user);
    expect(getAuthenticatedUserId(req)).toBe('requester-1');
    expect(getAuthenticatedUserRole(req)).toBe('requester');
    expect(getAuthenticatedUser({})).toBeNull();
    expect(getAuthenticatedUserId({ session: { user: { role: 'requester' } } })).toBeNull();
    expect(getAuthenticatedUserRole({})).toBeNull();
  });

  it('hashes the password before creating a requester account', async () => {
    query.mockResolvedValue({
      rows: [
        {
          user_id: 'requester-1',
          email: 'amelia@example.com',
          first_name: 'Amelia',
          last_name: 'Carter',
          user_type: 'REQUESTER',
        },
      ],
    });

    await authService.createRequester({
      firstName: 'Amelia',
      lastName: 'Carter',
      email: 'amelia@example.com',
      phone: '',
      password: 'SecurePass1',
    });

    const storedHash = query.mock.calls[0][1][1];
    expect(storedHash).not.toBe('SecurePass1');
    expect(bcrypt.getRounds(storedHash)).toBe(12);
    expect(await bcrypt.compare('SecurePass1', storedHash)).toBe(true);
    expect(query.mock.calls[0][0]).toContain("'REQUESTER'");
  });

  it('registers a requester and keeps the requester out of staff-only routes', async () => {
    query.mockResolvedValue({
      rows: [
        {
          user_id: 'requester-1',
          email: 'amelia@example.com',
          first_name: 'Amelia',
          last_name: 'Carter',
          user_type: 'REQUESTER',
        },
      ],
    });
    const agent = request.agent(app);

    const registration = await agent.post('/auth/register').send({
      firstName: 'Amelia',
      lastName: 'Carter',
      email: 'Amelia@Example.com',
      password: 'SecurePass1',
      terms: 'on',
    });

    expect(registration.status).toBe(302);
    expect(registration.headers.location).toBe('/requester/my-requests');
    expect((await agent.get('/protected')).status).toBe(200);
    expect((await agent.get('/staff-only')).status).toBe(403);
    expect((await agent.get('/staff/dashboard')).status).toBe(403);
    expect(query.mock.calls[0][1][0]).toBe('amelia@example.com');
  });

  it('rejects invalid registration data before querying the database', async () => {
    const response = await request(app).post('/auth/register').send({
      firstName: '',
      lastName: 'Carter',
      email: 'not-an-email',
      password: 'weak',
      terms: 'on',
    });

    expect(response.status).toBe(400);
    expect(response.text).toContain('Enter a first name');
    expect(query).not.toHaveBeenCalled();
  });

  it('shows a human-readable error when the email is already registered', async () => {
    query.mockResolvedValue({ rows: [] });

    const response = await request(app).post('/auth/register').send({
      firstName: 'Amelia',
      lastName: 'Carter',
      email: 'amelia@example.com',
      password: 'SecurePass1',
      terms: 'on',
    });

    expect(response.status).toBe(409);
    expect(response.text).toContain('An account with this email address already exists.');
  });

  it('authenticates a stored bcrypt hash and creates a requester session', async () => {
    const passwordHash = await bcrypt.hash('SecurePass1', 4);
    query
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: 'requester-1',
            email: 'amelia@example.com',
            first_name: 'Amelia',
            last_name: 'Carter',
            password_hash: passwordHash,
            user_type: 'REQUESTER',
            department_id: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const agent = request.agent(app);

    const response = await agent.post('/auth/login').send({
      email: 'Amelia@Example.com',
      password: 'SecurePass1',
    });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/requester/my-requests');
    expect((await agent.get('/protected')).status).toBe(200);
    expect(query).toHaveBeenNthCalledWith(
      2,
      'UPDATE users SET last_login_at = now() WHERE user_id = $1',
      ['requester-1']
    );
  });

  it('renders the logged-in database user in the application sidebar', async () => {
    const sessionUser = {
      id: 'requester-1',
      name: 'Amelia Carter',
      email: 'amelia@example.com',
      role: 'requester',
      departmentId: null,
      avatarInitials: 'AC',
    };
    const html = await ejs.renderFile(
      path.join(__dirname, '../../../shared/views/partials/app-layout-head.ejs'),
      {
        ...pageContext('requester', { session: { user: sessionUser } }),
        title: 'My Requests',
        pageTitle: 'My Requests',
        pageSubtitle: 'Track requests',
        activeHref: '/requester/my-requests',
      }
    );

    expect(html).toContain('Amelia Carter');
    expect(html).toContain('amelia@example.com');
    expect(html).not.toContain('Demo Requester');
  });

  it('rejects invalid credentials without exposing internal details', async () => {
    query.mockResolvedValue({ rows: [] });

    const response = await request(app).post('/auth/login').send({
      email: 'amelia@example.com',
      password: 'WrongPass1',
    });

    expect(response.status).toBe(401);
    expect(response.text).toContain('Email or password is incorrect.');
    expect(response.text).not.toContain('at Object.');
  });

  it('rejects an incorrect password for an existing account without creating a session', async () => {
    const passwordHash = await bcrypt.hash('IncorrectPass1123', 4);
    query.mockResolvedValueOnce({
      rows: [
        {
          user_id: 'requester-1',
          email: 'amelia@example.com',
          first_name: 'Amelia',
          last_name: 'Carter',
          password_hash: passwordHash,
          user_type: 'REQUESTER',
          department_id: null,
        },
      ],
    });
    const agent = request.agent(app);

    const response = await agent.post('/auth/login').send({
      email: 'amelia@example.com',
      password: 'IncorrectPass1',
    });

    expect(response.status).toBe(401);
    expect(response.text).toContain('Email or password is incorrect.');
    expect(query).toHaveBeenCalledTimes(1);
    expect((await agent.get('/protected')).status).toBe(401);
  });

  it('stores a staff role and department in the authenticated session', async () => {
    const passwordHash = await bcrypt.hash('SecurePass1', 4);
    query
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: 'staff-1',
            email: 'staff@example.com',
            first_name: 'Sam',
            last_name: 'Staff',
            password_hash: passwordHash,
            user_type: 'STAFF',
            department_id: 'department-1',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const agent = request.agent(app);

    const response = await agent.post('/auth/login').send({
      email: 'staff@example.com',
      password: 'SecurePass1',
    });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/staff/dashboard');
    expect((await agent.get('/staff-only')).status).toBe(200);
    expect((await agent.get('/department-only')).status).toBe(200);
  });

  it('destroys the session on logout', async () => {
    query.mockResolvedValue({
      rows: [
        {
          user_id: 'requester-1',
          email: 'amelia@example.com',
          first_name: 'Amelia',
          last_name: 'Carter',
          user_type: 'REQUESTER',
        },
      ],
    });
    const agent = request.agent(app);

    await agent.post('/auth/register').send({
      firstName: 'Amelia',
      lastName: 'Carter',
      email: 'amelia@example.com',
      password: 'SecurePass1',
      terms: 'on',
    });
    expect((await agent.get('/protected')).status).toBe(200);
    expect((await agent.post('/auth/logout')).status).toBe(302);
    expect((await agent.get('/protected')).status).toBe(401);
  });

  it('shows only configured demo roles in development', async () => {
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_DEMO_LOGINS = 'true';
    process.env.REQUESTER_EMAIL = 'local-requester@example.com';
    process.env.REQUESTER_PASSWORD = 'LocalPass1';

    const response = await request(app).get('/auth/login');

    expect(response.status).toBe(200);
    expect(response.text).toContain('name="demoRole" value="requester"');
    expect(response.text).toContain('name="demoRole" value="staff"');
    expect(response.text).toContain('name="demoRole" value="operator"');
    expect(response.text).toContain('name="demoRole" value="management"');
    expect(response.text).toContain('name="demoRole" value="admin"');
    expect(response.text).toContain('must be removed before deployment to staging');
  });

  it('uses configured credentials to authenticate demo logins against the database', async () => {
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_DEMO_LOGINS = 'true';
    process.env.REQUESTER_EMAIL = 'local-requester@example.com';
    process.env.REQUESTER_PASSWORD = 'LocalPass1';
    const passwordHash = await bcrypt.hash('LocalPass1', 4);
    query
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: 'requester-1',
            email: 'local-requester@example.com',
            first_name: 'Local',
            last_name: 'Requester',
            password_hash: passwordHash,
            user_type: 'REQUESTER',
            department_id: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const agent = request.agent(app);

    const response = await agent.post('/auth/login').send({ demoRole: 'requester' });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/requester/my-requests');
    expect(query.mock.calls[0][1]).toEqual(['local-requester@example.com']);
    expect((await agent.get('/protected')).status).toBe(200);
  });

  it('does not allow demo login outside local development and tests', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_DEMO_LOGINS = 'true';

    const response = await request(app).post('/auth/login').send({ demoRole: 'requester' });

    expect(response.status).toBe(404);
    expect(query).not.toHaveBeenCalled();
  });
});
