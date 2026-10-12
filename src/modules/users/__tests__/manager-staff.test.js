jest.mock('../../../config/database', () => ({
  query: jest.fn(),
  pool: { connect: jest.fn() },
}));

const bcrypt = require('bcrypt');
const express = require('express');
const session = require('express-session');
const request = require('supertest');
const db = require('../../../config/database');
const usersModel = require('../users.model');
const usersService = require('../users.service');
const usersRoutes = require('../users.routes');

const managerId = '11111111-1111-4111-8111-111111111111';
const departmentId = '22222222-2222-4222-8222-222222222222';
const staffId = '33333333-3333-4333-8333-333333333333';
const assignmentId = '44444444-4444-4444-8444-444444444444';
const staffInput = {
  firstName: 'Jane',
  lastName: 'Smith',
  email: 'Jane.Smith@example.com',
  phone: '555-1234',
  password: 'InitialPass1',
};

const app = express();
app.set('view engine', 'ejs');
app.set('views', [
  require('path').join(__dirname, '../..'),
  require('path').join(__dirname, '../../../shared/views'),
]);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  session({
    secret: 'manager-staff-tests',
    resave: false,
    saveUninitialized: false,
  })
);
app.get('/test/login/:role', (req, res) => {
  req.session.user = {
    id: managerId,
    name: 'Morgan Manager',
    email: 'manager@example.com',
    role: req.params.role,
    departmentId,
    avatarInitials: 'MM',
  };
  res.sendStatus(204);
});
app.use(usersRoutes);

const makeClient = (queryImplementation) => {
  const client = {
    query: jest.fn(queryImplementation),
    release: jest.fn(),
  };
  db.pool.connect.mockResolvedValue(client);
  return client;
};

const provideListData = () => {
  db.query
    .mockResolvedValueOnce({
      rows: [{ departmentId, departmentName: 'Water and Sanitation' }],
    })
    .mockResolvedValueOnce({
      rows: [
        {
          userId: staffId,
          firstName: 'Sam',
          lastName: 'Staff',
          email: 'sam@example.com',
          isActive: true,
        },
        {
          userId: '55555555-5555-4555-8555-555555555555',
          firstName: 'Alex',
          lastName: 'Former',
          email: 'alex@example.com',
          isActive: false,
        },
      ],
    });
};

const csrfFrom = (html) => html.match(/name="_csrf" value="([^"]+)"/)[1];

beforeEach(() => {
  jest.clearAllMocks();
});

describe('manager staff service', () => {
  it('validates required fields and password policy before hashing or database access', async () => {
    await expect(
      usersService.createStaff(managerId, {
        firstName: '',
        lastName: 'Smith',
        email: 'invalid',
        phone: '',
        password: 'weak',
      })
    ).rejects.toMatchObject({
      name: 'StaffValidationError',
      errors: expect.objectContaining({
        firstName: expect.any(String),
        email: expect.any(String),
        password: expect.any(String),
      }),
    });
    expect(db.pool.connect).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('hashes the password and creates a staff account with the manager-derived department', async () => {
    const client = makeClient(async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      if (sql.includes('FROM departments d')) return { rows: [{ department_id: departmentId }] };
      if (sql.includes('INSERT INTO users')) return { rows: [{ userId: staffId }] };
      if (sql.includes('INSERT INTO staff_assignments')) {
        return { rows: [{ staff_assignment_id: assignmentId }] };
      }
      if (sql.includes('INSERT INTO admin_audit_log')) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    });

    await usersService.createStaff(managerId, {
      ...staffInput,
      department_id: '99999999-9999-4999-8999-999999999999',
      user_type: 'ADMIN',
    });

    const userInsert = client.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO users'));
    const assignmentInsert = client.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO staff_assignments')
    );
    const departmentLookup = client.query.mock.calls.find(([sql]) =>
      sql.includes('FROM departments d')
    );
    expect(departmentLookup[0]).toContain('WHERE d.manager_id = $1');
    expect(departmentLookup[1]).toEqual([managerId]);
    const passwordHash = userInsert[1][1];
    expect(passwordHash).not.toBe(staffInput.password);
    expect(bcrypt.getRounds(passwordHash)).toBe(12);
    expect(await bcrypt.compare(staffInput.password, passwordHash)).toBe(true);
    expect(userInsert[0]).toContain("'STAFF'");
    expect(userInsert[1]).toEqual([
      'jane.smith@example.com',
      passwordHash,
      'Jane',
      'Smith',
      '555-1234',
    ]);
    expect(assignmentInsert[1]).toEqual([staffId, departmentId, managerId]);
    expect(
      client.query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO admin_audit_log'))
    ).toHaveLength(2);
    expect(
      client.query.mock.calls
        .filter(([sql]) => sql.includes('INSERT INTO admin_audit_log'))
        .map(([, params]) => params[1])
    ).toEqual(['USER_CREATED', 'STAFF_ASSIGNED']);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('rolls back user creation when adding the department assignment fails', async () => {
    const client = makeClient(async (sql) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('FROM departments d')) return { rows: [{ department_id: departmentId }] };
      if (sql.includes('INSERT INTO users')) return { rows: [{ userId: staffId }] };
      if (sql.includes('INSERT INTO staff_assignments'))
        throw new Error('assignment insert failed');
      if (sql.includes('INSERT INTO admin_audit_log')) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    });

    await expect(usersService.createStaff(managerId, staffInput)).rejects.toThrow(
      'assignment insert failed'
    );
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.query).not.toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('lists the latest assignment status under the authenticated manager department', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ userId: staffId, isActive: true }] });

    await usersModel.findStaffForManager(managerId, departmentId);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('d.manager_id = $1 AND d.department_id = $2'),
      [managerId, departmentId]
    );
    expect(db.query.mock.calls[0][0]).toContain('(staff.is_active AND sa.is_active) AS "isActive"');
    expect(db.query.mock.calls[0][0]).toContain('DISTINCT ON (staff.user_id)');
    expect(db.query.mock.calls[0][0]).toContain("staff.user_type = 'STAFF'");
  });

  it('closes the scoped assignment and deactivates the user in one transaction', async () => {
    const client = makeClient(async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      if (sql.includes('SELECT sa.staff_assignment_id')) {
        return { rows: [{ staff_assignment_id: assignmentId }] };
      }
      return { rows: [] };
    });

    await usersService.deactivateStaff(managerId, staffId);

    expect(client.query.mock.calls[1]).toEqual([
      expect.stringContaining('d.manager_id = $2'),
      [staffId, managerId],
    ]);
    expect(
      client.query.mock.calls.some(([sql]) => sql.includes('UPDATE users SET is_active = false'))
    ).toBe(true);
    expect(client.query.mock.calls.some(([sql]) => sql.includes('removed_at = now()'))).toBe(true);
    expect(
      client.query.mock.calls
        .filter(([sql]) => sql.includes('INSERT INTO admin_audit_log'))
        .map(([, params]) => params[1])
    ).toEqual(['USER_DEACTIVATED', 'STAFF_REMOVED']);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('does not query the database for a malformed staff identifier', async () => {
    await expect(usersService.deactivateStaff(managerId, 'not-a-uuid')).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(db.pool.connect).not.toHaveBeenCalled();
  });

  it('does not deactivate a staff account outside the manager department', async () => {
    const client = makeClient(async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      if (sql.includes('SELECT sa.staff_assignment_id')) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    });

    await expect(usersService.deactivateStaff(managerId, staffId)).rejects.toMatchObject({
      statusCode: 404,
    });
    const scopeLookup = client.query.mock.calls.find(([sql]) =>
      sql.includes('SELECT sa.staff_assignment_id')
    );
    expect(scopeLookup[0]).toContain('d.manager_id = $2');
    expect(scopeLookup[1]).toEqual([staffId, managerId]);
    expect(client.query.mock.calls.some(([sql]) => sql.includes('UPDATE users'))).toBe(false);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('reactivates the assignment and records the change in the audit trail', async () => {
    const client = makeClient(async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      if (sql.includes('SELECT sa.staff_assignment_id, sa.department_id')) {
        return {
          rows: [
            {
              department_id: departmentId,
              staff_assignment_id: assignmentId,
              has_active_assignment: false,
            },
          ],
        };
      }
      if (sql.includes('INSERT INTO admin_audit_log')) return { rows: [] };
      return { rows: [] };
    });

    await usersService.reactivateStaff(managerId, staffId);

    const assignmentUpdate = client.query.mock.calls.find(([sql]) =>
      sql.includes('UPDATE staff_assignments')
    );
    expect(assignmentUpdate[0]).toContain('removed_at = NULL');
    expect(assignmentUpdate[1]).toEqual([assignmentId, managerId]);
    expect(
      client.query.mock.calls.some(([sql]) => sql.includes('UPDATE users SET is_active = true'))
    ).toBe(true);
    expect(
      client.query.mock.calls
        .filter(([sql]) => sql.includes('INSERT INTO admin_audit_log'))
        .map(([, params]) => params[1])
    ).toEqual(['USER_MODIFIED', 'STAFF_ASSIGNED']);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('rejects reactivation if the staff member already has an active assignment', async () => {
    const client = makeClient(async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      if (sql.includes('SELECT sa.staff_assignment_id, sa.department_id')) {
        return {
          rows: [{ department_id: departmentId, has_active_assignment: true }],
        };
      }
      if (sql.includes('INSERT INTO admin_audit_log')) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    });

    await expect(usersService.reactivateStaff(managerId, staffId)).rejects.toMatchObject({
      name: 'StaffAssignmentConflictError',
      statusCode: 409,
    });
    expect(
      client.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO staff_assignments'))
    ).toBe(false);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });
});

describe('manager staff routes', () => {
  it('redirects anonymous users to login and denies requester and staff accounts', async () => {
    const anonymous = await request(app).get('/manager/users');
    expect(anonymous.status).toBe(302);
    expect(anonymous.headers.location).toBe('/auth/login');

    for (const role of ['requester', 'staff']) {
      const agent = request.agent(app);
      await agent.get(`/test/login/${role}`);
      expect((await agent.get('/manager/users')).status).toBe(403);
      expect((await agent.post('/manager/users')).status).toBe(403);
      expect((await agent.post(`/manager/users/${staffId}/deactivate`)).status).toBe(403);
      expect((await agent.post(`/manager/users/${staffId}/activate`)).status).toBe(403);
    }
  });

  it('renders only database-scoped department staff and the functional form', async () => {
    provideListData();
    const agent = request.agent(app);
    await agent.get('/test/login/management');
    const response = await agent.get('/manager/users');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Water and Sanitation');
    expect(response.text).toContain('Sam Staff');
    expect(response.text).toContain('sam@example.com');
    expect(response.text).toContain('Deactivated staff');
    expect(response.text).toContain('alex@example.com');
    expect(response.text).toContain('Alex Former');
    expect(response.text).toContain('/manager/users/55555555-5555-4555-8555-555555555555/activate');
    expect(response.text).toContain('name="firstName"');
    expect(response.text).toContain('name="lastName"');
    expect(response.text).toContain('name="password"');
    expect(response.text).toContain(
      '/manager/users/33333333-3333-4333-8333-333333333333/deactivate'
    );
    expect(response.text).toContain('<dialog id="staff-confirm-dialog"');
    expect(response.text).toContain('data-confirm-title="Deactivate staff member?"');
    expect(response.text).toContain('data-confirm-title="Re-enable staff member?"');
    expect(response.text).not.toContain('onsubmit="return confirm(');
  });

  it('creates a staff account, ignoring posted department and role values', async () => {
    provideListData();
    const agent = request.agent(app);
    await agent.get('/test/login/management');
    const page = await agent.get('/manager/users');
    const client = makeClient(async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      if (sql.includes('FROM departments d')) return { rows: [{ department_id: departmentId }] };
      if (sql.includes('INSERT INTO users')) return { rows: [{ userId: staffId }] };
      if (sql.includes('INSERT INTO staff_assignments')) {
        return { rows: [{ staff_assignment_id: assignmentId }] };
      }
      if (sql.includes('INSERT INTO admin_audit_log')) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    });

    const response = await agent
      .post('/manager/users')
      .type('form')
      .send({
        ...staffInput,
        _csrf: csrfFrom(page.text),
        department_id: '99999999-9999-4999-8999-999999999999',
        user_type: 'ADMIN',
      });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/manager/users?status=created');
    const userInsert = client.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO users'));
    expect(userInsert[0]).toContain("'STAFF'");
    const assignmentInsert = client.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO staff_assignments')
    );
    expect(assignmentInsert[1]).toEqual([staffId, departmentId, managerId]);
  });

  it('deactivates a listed staff member and closes the assignment', async () => {
    provideListData();
    const agent = request.agent(app);
    await agent.get('/test/login/management');
    const page = await agent.get('/manager/users');
    const client = makeClient(async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      if (sql.includes('SELECT sa.staff_assignment_id')) {
        return { rows: [{ staff_assignment_id: assignmentId, department_id: departmentId }] };
      }
      if (sql.includes('INSERT INTO admin_audit_log')) return { rows: [] };
      return { rows: [] };
    });

    const response = await agent
      .post(`/manager/users/${staffId}/deactivate`)
      .type('form')
      .send({ _csrf: csrfFrom(page.text) });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/manager/users?status=deactivated');
    expect(
      client.query.mock.calls.some(([sql]) => sql.includes('UPDATE users SET is_active = false'))
    ).toBe(true);
    expect(client.query.mock.calls.some(([sql]) => sql.includes('removed_at = now()'))).toBe(true);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('enables an inactive staff member using the manager-scoped activation route', async () => {
    provideListData();
    const agent = request.agent(app);
    await agent.get('/test/login/management');
    const page = await agent.get('/manager/users');
    const client = makeClient(async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      if (sql.includes('SELECT sa.staff_assignment_id, sa.department_id')) {
        return {
          rows: [
            {
              department_id: departmentId,
              staff_assignment_id: assignmentId,
              has_active_assignment: false,
            },
          ],
        };
      }
      if (sql.includes('INSERT INTO admin_audit_log')) return { rows: [] };
      return { rows: [] };
    });

    const response = await agent
      .post(`/manager/users/${staffId}/activate`)
      .type('form')
      .send({ _csrf: csrfFrom(page.text) });

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/manager/users?status=activated');
    expect(client.query.mock.calls.some(([sql]) => sql.includes('UPDATE staff_assignments'))).toBe(
      true
    );
    expect(
      client.query.mock.calls.some(([sql]) => sql.includes('UPDATE users SET is_active = true'))
    ).toBe(true);
  });

  it('re-renders invalid submissions with field errors and entered values, never the password', async () => {
    provideListData();
    const agent = request.agent(app);
    await agent.get('/test/login/management');
    const page = await agent.get('/manager/users');
    provideListData();

    const response = await agent
      .post('/manager/users')
      .type('form')
      .send({
        firstName: 'Entered Name',
        lastName: '',
        email: 'bad-email',
        phone: '',
        password: 'bad',
        _csrf: csrfFrom(page.text),
      });

    expect(response.status).toBe(400);
    expect(response.text).toContain('Entered Name');
    expect(response.text).toContain('Enter a last name');
    expect(response.text).toContain('Enter a valid email address');
    expect(response.text).toContain('Initial password');
    expect(response.text).not.toContain('value="bad"');
    expect(db.pool.connect).not.toHaveBeenCalled();
  });

  it('shows a readable duplicate-email error without creating an assignment', async () => {
    provideListData();
    const agent = request.agent(app);
    await agent.get('/test/login/management');
    const page = await agent.get('/manager/users');
    provideListData();
    const client = makeClient(async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
      if (sql.includes('FROM departments d')) return { rows: [{ department_id: departmentId }] };
      if (sql.includes('INSERT INTO users')) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    });

    const response = await agent
      .post('/manager/users')
      .type('form')
      .send({ ...staffInput, _csrf: csrfFrom(page.text) });

    expect(response.status).toBe(409);
    expect(response.text).toContain('An account with this email address already exists.');
    expect(response.text).toContain('Jane');
    expect(response.text).not.toContain('value="InitialPass1"');
    expect(
      client.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO staff_assignments'))
    ).toBe(false);
  });
});
