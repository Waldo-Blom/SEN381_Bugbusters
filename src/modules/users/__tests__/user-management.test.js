jest.mock('../../../config/database', () => ({
  query: jest.fn(),
  pool: { connect: jest.fn() },
}));

describe('Administrator user management', () => {
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

    it('rejects duplicate department names with a human-readable error', async () => {
      makeClient(async (sql) => {
        if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
        if (sql.includes('INSERT INTO departments')) return { rows: [] };
        throw new Error(`Unexpected query: ${sql}`);
      });

      await expect(usersService.createDepartment(adminId, { name: 'Roads' })).rejects.toMatchObject(
        {
          name: 'DuplicateDepartmentNameError',
          statusCode: 409,
          errors: { name: 'A department with this name already exists.' },
        }
      );
    });

    it('validates request category details and department before database access', async () => {
      await expect(
        usersService.createRequestCategory(adminId, {
          name: '',
          departmentId: 'not-a-uuid',
        })
      ).rejects.toMatchObject({
        name: 'RequestCategoryValidationError',
        errors: {
          name: expect.any(String),
          departmentId: expect.any(String),
        },
      });
      expect(db.pool.connect).not.toHaveBeenCalled();
    });

    it('creates a request category attached to exactly one active department', async () => {
      const categoryId = '77777777-7777-4777-8777-777777777777';
      const client = makeClient(async (sql) => {
        if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
        if (sql.includes('FROM departments')) return { rows: [{ department_id: departmentId }] };
        if (sql.includes('INSERT INTO request_categories')) return { rows: [{ categoryId }] };
        if (sql.includes('INSERT INTO admin_audit_log')) return { rows: [] };
        throw new Error(`Unexpected query: ${sql}`);
      });

      const result = await usersService.createRequestCategory(adminId, {
        name: '  Road Maintenance  ',
        description: '  Potholes and road damage  ',
        departmentId,
        departmentIds: [departmentId, '88888888-8888-4888-8888-888888888888'],
      });

      expect(result).toEqual({ categoryId });
      const insert = client.query.mock.calls.find(([sql]) =>
        sql.includes('INSERT INTO request_categories')
      );
      expect(insert[0]).toContain('department_id)');
      expect(insert[0]).toContain('VALUES ($1, $2, $3)');
      expect(insert[1]).toEqual(['Road Maintenance', 'Potholes and road damage', departmentId]);
      expect(
        client.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO admin_audit_log'))[1][1]
      ).toBe('CATEGORY_CREATED');
    });

    it('rejects a category assigned to a missing or inactive department', async () => {
      makeClient(async (sql) => {
        if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
        if (sql.includes('FROM departments')) return { rows: [] };
        throw new Error(`Unexpected query: ${sql}`);
      });

      await expect(
        usersService.createRequestCategory(adminId, {
          name: 'Road Maintenance',
          departmentId,
        })
      ).rejects.toMatchObject({
        name: 'RequestCategoryDepartmentError',
        errors: { departmentId: expect.any(String) },
      });
    });

    it('rejects duplicate request category names with a human-readable error', async () => {
      makeClient(async (sql) => {
        if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
        if (sql.includes('FROM departments')) return { rows: [{ department_id: departmentId }] };
        if (sql.includes('INSERT INTO request_categories')) return { rows: [] };
        throw new Error(`Unexpected query: ${sql}`);
      });

      await expect(
        usersService.createRequestCategory(adminId, { name: 'Road Maintenance', departmentId })
      ).rejects.toMatchObject({
        name: 'DuplicateRequestCategoryNameError',
        statusCode: 409,
        errors: { name: 'A request category with this name already exists.' },
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
      expect(client.query.mock.calls.some(([sql]) => sql.includes('DELETE FROM users'))).toBe(
        false
      );
    });
  });
});

describe('Manager and staff user management', () => {
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

    it('lists the latest assignment status under the authenticated manager department', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ userId: staffId, isActive: true }] });

      await usersModel.findStaffForManager(managerId, departmentId);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('d.manager_id = $1 AND d.department_id = $2'),
        [managerId, departmentId]
      );
      expect(db.query.mock.calls[0][0]).toContain(
        '(staff.is_active AND sa.is_active) AS "isActive"'
      );
      expect(db.query.mock.calls[0][0]).toContain('DISTINCT ON (staff.user_id)');
      expect(db.query.mock.calls[0][0]).toContain("staff.user_type = 'STAFF'");
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
  });
});
