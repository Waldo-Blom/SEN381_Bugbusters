jest.mock('../../../config/database', () => ({
  query: jest.fn(),
  pool: { connect: jest.fn() },
}));

const path = require('path');
const bcrypt = require('bcrypt');
const express = require('express');
const session = require('express-session');
const request = require('supertest');
const db = require('../../../config/database');
const usersService = require('../users.service');
const usersRoutes = require('../users.routes');

const adminId = '11111111-1111-4111-8111-111111111111';
const departmentId = '22222222-2222-4222-8222-222222222222';
const managerId = '33333333-3333-4333-8333-333333333333';
const staffId = '44444444-4444-4444-8444-444444444444';
const managerInput = {
  firstName: 'Morgan',
  lastName: 'Manager',
  email: 'Morgan.Manager@example.com',
  phone: '555-1234',
  password: 'InitialPass1',
  departmentId,
};

const app = express();
app.set('view engine', 'ejs');
app.set('views', [path.join(__dirname, '../..'), path.join(__dirname, '../../../shared/views')]);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  session({
    secret: 'admin-user-tests',
    resave: false,
    saveUninitialized: false,
  })
);
app.get('/test/login/:role', (req, res) => {
  req.session.user = {
    id: req.params.role === 'admin' ? adminId : managerId,
    name: 'Test User',
    email: 'test@example.com',
    role: req.params.role,
    departmentId,
    avatarInitials: 'TU',
  };
  res.sendStatus(204);
});
app.use(usersRoutes);

const makeClient = (implementation) => {
  const client = { query: jest.fn(implementation), release: jest.fn() };
  db.pool.connect.mockResolvedValue(client);
  return client;
};

const csrfFrom = (html) => html.match(/name="_csrf" value="([^"]+)"/)[1];

beforeEach(() => {
  jest.clearAllMocks();
});

describe('admin user management', () => {
  it('validates manager fields and department before hashing or database access', async () => {
    await expect(
      usersService.createManager(adminId, {
        ...managerInput,
        firstName: '',
        email: 'not-an-email',
        departmentId: 'not-a-uuid',
      })
    ).rejects.toMatchObject({
      name: 'ManagerValidationError',
      errors: expect.objectContaining({
        firstName: expect.any(String),
        email: expect.any(String),
        departmentId: expect.any(String),
      }),
    });
    expect(db.pool.connect).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('creates and hashes a manager account and assigns the selected department transactionally', async () => {
    const client = makeClient(async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      if (sql.includes('FROM departments')) return { rows: [{ department_id: departmentId }] };
      if (sql.includes('INSERT INTO users')) return { rows: [{ userId: managerId }] };
      if (sql.includes('UPDATE departments SET manager_id')) return { rows: [] };
      if (sql.includes('INSERT INTO admin_audit_log')) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    });

    await usersService.createManager(adminId, managerInput);

    const userInsert = client.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO users'));
    expect(userInsert[0]).toContain("'MANAGER'");
    expect(userInsert[1][0]).toBe('morgan.manager@example.com');
    expect(await bcrypt.compare(managerInput.password, userInsert[1][1])).toBe(true);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE departments SET manager_id'),
      [managerId, departmentId]
    );
    expect(
      client.query.mock.calls
        .filter(([sql]) => sql.includes('INSERT INTO admin_audit_log'))
        .map(([, params]) => params[1])
    ).toEqual(['USER_CREATED', 'MANAGER_CREATED']);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('validates department details before accessing the database', async () => {
    await expect(
      usersService.createDepartment(adminId, { name: '  ', description: 'Details' })
    ).rejects.toMatchObject({
      name: 'DepartmentValidationError',
      errors: { name: expect.any(String) },
    });
    await expect(
      usersService.createDepartment(adminId, {
        name: 'Valid department',
        description: 'x'.repeat(2001),
      })
    ).rejects.toMatchObject({
      name: 'DepartmentValidationError',
      errors: { description: expect.any(String) },
    });
    expect(db.pool.connect).not.toHaveBeenCalled();
  });

  it('creates a department without a manager and records an audit event', async () => {
    const departmentId = '66666666-6666-4666-8666-666666666666';
    const client = makeClient(async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      if (sql.includes('INSERT INTO departments')) return { rows: [{ departmentId }] };
      if (sql.includes('INSERT INTO admin_audit_log')) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    });

    const result = await usersService.createDepartment(adminId, {
      name: '  Parks and Recreation  ',
      description: '  Public spaces  ',
    });

    expect(result).toEqual({ departmentId });
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('VALUES ($1, $2, NULL)'), [
      'Parks and Recreation',
      'Public spaces',
    ]);
    expect(
      client.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO admin_audit_log'))[1][1]
    ).toBe('DEPARTMENT_CREATED');
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('rejects duplicate department names with a human-readable error', async () => {
    makeClient(async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      if (sql.includes('INSERT INTO departments')) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    });

    await expect(usersService.createDepartment(adminId, { name: 'Roads' })).rejects.toMatchObject({
      name: 'DuplicateDepartmentNameError',
      statusCode: 409,
      errors: { name: 'A department with this name already exists.' },
    });
  });

  it('rejects duplicate manager email addresses with a useful validation error', async () => {
    makeClient(async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      if (sql.includes('FROM departments')) return { rows: [{ department_id: departmentId }] };
      if (sql.includes('INSERT INTO users')) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    });

    await expect(usersService.createManager(adminId, managerInput)).rejects.toMatchObject({
      name: 'DuplicateManagerEmailError',
      statusCode: 409,
      errors: { email: 'An account with this email address already exists.' },
    });
  });

  it('lists management accounts by role with their department and current activity', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ userId: managerId, userType: 'MANAGER' }] });
    db.query.mockResolvedValueOnce({ rows: [{ departmentId, departmentName: 'Roads' }] });

    const data = await usersService.listAdminUsers();

    expect(data.users).toHaveLength(1);
    expect(db.query.mock.calls[0][0]).toContain("u.user_type IN ('MANAGER', 'STAFF')");
    expect(db.query.mock.calls[0][0]).toContain('staff_assignments');
    expect(db.query.mock.calls[1][0]).toContain('FROM departments d');
  });

  it('allows only administrators to view or create manager accounts', async () => {
    const manager = request.agent(app);
    await manager.get('/test/login/management');
    expect((await manager.get('/admin/users')).status).toBe(403);
    expect((await manager.post('/admin/users')).status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
    expect(db.pool.connect).not.toHaveBeenCalled();
  });

  it('renders the admin user list and manager creation page', async () => {
    const admin = request.agent(app);
    await admin.get('/test/login/admin');
    db.query
      .mockResolvedValueOnce({
        rows: [
          {
            userId: staffId,
            firstName: 'Sam',
            userType: 'STAFF',
            isActive: true,
            departmentName: 'Roads',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            departmentId,
            departmentName: 'Roads',
            managerFirstName: 'Current',
            managerLastName: 'Manager',
          },
        ],
      });
    const list = await admin.get('/admin/users');
    expect(list.status).toBe(200);
    expect(list.text).toContain('Manage managers and staff across all departments');
    expect(list.text).toContain('Sam');
    expect(list.text).toContain('Roads');

    db.query.mockResolvedValueOnce({ rows: [{ departmentId, departmentName: 'Roads' }] });
    const createPage = await admin.get('/admin/users/create');
    expect(createPage.status).toBe(200);
    expect(createPage.text).toContain('Create Manager Account');
    expect(createPage.text).toContain('name="departmentId"');
    expect(createPage.text).toContain('name="_csrf"');
  });

  it('provides a separate departments page in the admin navigation', async () => {
    const admin = request.agent(app);
    await admin.get('/test/login/admin');
    db.query.mockResolvedValueOnce({
      rows: [
        {
          departmentId,
          departmentName: 'Roads',
          description: 'Transport services',
          isActive: true,
          managerFirstName: null,
          managerLastName: null,
        },
      ],
    });

    const response = await admin.get('/admin/departments');

    expect(response.status).toBe(200);
    expect(response.text).toContain('href="/admin/departments"');
    expect(response.text).toContain('href="/admin/users"');
    expect(response.text).toContain('Roads');
    expect(response.text).toContain('Not assigned');
    expect(response.text).toContain('/admin/departments/create');
  });

  it('creates a manager from the admin form and redirects into admin user management', async () => {
    const admin = request.agent(app);
    await admin.get('/test/login/admin');
    db.query.mockResolvedValueOnce({ rows: [{ departmentId, departmentName: 'Roads' }] });
    const form = await admin.get('/admin/users/create');
    const client = makeClient(async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      if (sql.includes('FROM departments')) return { rows: [{ department_id: departmentId }] };
      if (sql.includes('INSERT INTO users')) return { rows: [{ userId: managerId }] };
      if (sql.includes('UPDATE departments SET manager_id')) return { rows: [] };
      if (sql.includes('INSERT INTO admin_audit_log')) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    });

    const response = await admin
      .post('/admin/users')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send({
        ...managerInput,
        _csrf: csrfFrom(form.text),
      });
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/admin/users?status=created');
    expect(client.query.mock.calls.some(([sql]) => sql.includes("'MANAGER'"))).toBe(true);
  });

  it('allows administrators to add a department from the admin screen', async () => {
    const admin = request.agent(app);
    await admin.get('/test/login/admin');
    const form = await admin.get('/admin/departments/create');
    expect(form.status).toBe(200);
    expect(form.text).toContain('Department name');
    expect(form.text).toContain('name="_csrf"');

    const client = makeClient(async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      if (sql.includes('INSERT INTO departments')) {
        return { rows: [{ departmentId: '66666666-6666-4666-8666-666666666666' }] };
      }
      if (sql.includes('INSERT INTO admin_audit_log')) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    });
    const response = await admin
      .post('/admin/departments')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send({
        name: 'Parks',
        description: 'Public spaces',
        _csrf: csrfFrom(form.text),
      });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/admin/departments?status=created');
    expect(client.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO departments'))).toBe(
      true
    );
  });

  it('deactivates managed users rather than deleting records', async () => {
    const client = makeClient(async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      if (sql.includes('SELECT user_type, is_active')) {
        return { rows: [{ user_type: 'STAFF', is_active: true }] };
      }
      if (sql.includes('UPDATE staff_assignments')) {
        return {
          rows: [
            {
              staff_assignment_id: '55555555-5555-4555-8555-555555555555',
              department_id: departmentId,
            },
          ],
        };
      }
      if (sql.includes('INSERT INTO admin_audit_log')) return { rows: [] };
      return { rows: [] };
    });

    await usersService.deactivateUserForAdmin(adminId, staffId);

    expect(
      client.query.mock.calls.some(([sql]) => sql.includes('UPDATE users SET is_active = false'))
    ).toBe(true);
    expect(client.query.mock.calls.some(([sql]) => sql.includes('DELETE FROM users'))).toBe(false);
  });
});
