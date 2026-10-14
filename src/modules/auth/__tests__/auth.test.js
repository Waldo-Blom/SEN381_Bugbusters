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
const { validateRegistration } = require('../auth.schema');
const authRoutes = require('../auth.routes');
const { requireAuth, requireRole, requireDepartment } = require('../auth.middleware');
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

describe('Requester authentication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires credentials when an old quick-login button request is submitted', async () => {
    const agent = request.agent(app);
    const response = await agent.post('/auth/login').send({ demoRole: 'admin' });

    expect(response.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
    expect((await agent.get('/protected')).status).toBe(401);
  });

  it('renders the normal sign-in form without quick-login buttons', async () => {
    const response = await request(app).get('/auth/login');

    expect(response.status).toBe(200);
    expect(response.text).toContain('name="email"');
    expect(response.text).toContain('name="password"');
    expect(response.text).not.toContain('name="demoRole"');
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

  it('still requires registration passwords to have at least 8 characters', () => {
    const result = validateRegistration({
      firstName: 'Amelia',
      lastName: 'Carter',
      email: 'amelia@example.com',
      password: 'Abc1',
      terms: 'on',
    });

    expect(result.errors).toContain(
      'Password must be at least 8 characters, include an uppercase letter and a number.'
    );
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
});
