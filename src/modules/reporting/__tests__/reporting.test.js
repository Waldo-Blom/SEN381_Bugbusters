jest.mock('../../../config/database', () => ({ query: jest.fn() }));
// Keep reporting coverage together while keeping route authorization, service
// calculations, activity formatting, and inbox privacy independently readable.
describe('Audit reporting', () => {
  const { query } = require('../../../config/database');

  beforeEach(() => query.mockReset());

  describe('Management dashboard routes', () => {
    const path = require('path');
    const express = require('express');
    const request = require('supertest');
    const { query } = require('../../../config/database');
    const routes = require('../reporting.routes');

    const managerId = '11111111-1111-4111-8111-111111111111';
    const departmentId = '22222222-2222-4222-8222-222222222222';

    const createApp = (user) => {
      const app = express();
      app.set('view engine', 'ejs');
      app.set('views', [
        path.join(__dirname, '../..'),
        path.join(__dirname, '../../../shared/views'),
      ]);
      app.use((req, res, next) => {
        req.session = { user };
        next();
      });
      app.use(routes);
      // eslint-disable-next-line no-unused-vars
      app.use((err, req, res, next) => res.status(500).send('Database unavailable'));
      return app;
    };

    const manager = {
      id: managerId,
      role: 'management',
      name: 'Test Manager',
      email: 'manager@example.com',
      avatarInitials: 'TM',
      departmentId: 'stale-session-department',
    };

    describe('Management dashboard department access', () => {
      beforeEach(() => {
        query.mockReset();
        query.mockResolvedValue({
          rows: [
            {
              open: '1',
              overdue: '0',
              resolved: '0',
              closed: '0',
              eligible_total: '1',
              avg_response_hours: null,
              sla_total: '0',
              sla_met: '0',
            },
          ],
        });
      });

      it('rejects signed-out users without querying the database', async () => {
        expect((await request(createApp(null)).get('/manager/dashboard')).status).toBe(401);
        expect(query).not.toHaveBeenCalled();
      });

      it.each(['staff', 'requester', 'admin', 'operator'])(
        'rejects the %s role without querying the database',
        async (role) => {
          expect(
            (await request(createApp({ ...manager, role })).get('/manager/dashboard')).status
          ).toBe(403);
          expect(query).not.toHaveBeenCalled();
        }
      );

      it('renders the database department and scopes reads using verified ownership', async () => {
        // The department lookup is authoritative; a stale session department must never widen access.
        query.mockResolvedValueOnce({ rows: [{ id: departmentId, name: 'Utilities' }] });
        query.mockResolvedValueOnce({
          rows: [
            {
              id: 'request-1',
              reference: 'CC-0001',
              title: 'Water leak',
              category: 'Water',
              status: 'IN_PROGRESS',
              priority: 'HIGH',
              event_type: 'status',
              event_status: 'IN_PROGRESS',
              timestamp: '2026-10-11 08:00',
              actor: 'Test Staff',
            },
          ],
        });
        const response = await request(createApp(manager)).get('/manager/dashboard');
        expect(response.status).toBe(200);
        expect(response.text).toContain('Utilities');
        expect(response.text).toContain('Water leak');
        expect(response.text).toContain('In Progress');
        expect(response.text).toContain('Status changed to In Progress');
        expect(response.text).toContain('Test Staff');
        expect(response.text).toContain('/manager/requests/request-1');
        expect(response.text).toContain('Not available');
        expect(response.text).not.toContain('15% faster');
        expect(query.mock.calls[2][1]).toEqual([departmentId, managerId]);
        expect(response.text).not.toContain('stale-session-department');
        expect(query).toHaveBeenNthCalledWith(
          1,
          expect.stringContaining("u.user_type = 'MANAGER'"),
          [managerId]
        );
        const [sql, params] = query.mock.calls[1];
        expect(sql).toContain('d.department_id = $1 AND d.manager_id = $2');
        expect(sql).toContain('d.is_active = true AND u.is_active = true');
        expect(params).toEqual([departmentId, managerId]);
        expect(sql).not.toContain('requester_email');
      });

      it('passes database failures to error handling', async () => {
        query.mockRejectedValueOnce(new Error('connection failed'));
        const response = await request(createApp(manager)).get('/manager/dashboard');
        expect(response.status).toBe(500);
        expect(response.text).not.toContain('connection failed');
      });
    });
  });
});

describe('Dashboard statistics', () => {
  const model = require('../reporting.model');
  const service = require('../reporting.service');

  describe('Dashboard statistics presentation', () => {
    beforeEach(() => {
      jest.restoreAllMocks();
      jest
        .spyOn(model, 'findManagedDepartment')
        .mockResolvedValue({ id: 'department', name: 'Utilities' });
      jest.spyOn(model, 'findRecentActivity').mockResolvedValue([]);
      jest.spyOn(model, 'findDashboardStats');
    });

    afterEach(() => jest.restoreAllMocks());

    it('converts PostgreSQL counts and calculates percentages with closed requests included', async () => {
      model.findDashboardStats.mockResolvedValue({
        open: '3',
        overdue: '2',
        resolved: '2',
        closed: '1',
        eligible_total: '6',
        avg_response_hours: '2.345',
        sla_total: '3',
        sla_met: '2',
      });
      const data = await service.getDashboardData('manager');
      expect(data.stats).toEqual({
        open: 3,
        overdue: 2,
        resolved: 2,
        closed: 1,
        avgResponseHours: '2.3',
        resolutionRate: '50.0',
        slaCompliance: '66.7',
        slaTotal: 3,
      });
      expect(model.findDashboardStats).toHaveBeenCalledWith('manager', 'department');
    });

    it('represents missing samples as unavailable rather than zero or NaN', async () => {
      // No eligible requests means these rates cannot be calculated, rather than being 0%.
      model.findDashboardStats.mockResolvedValue({
        open: '0',
        overdue: '0',
        resolved: '0',
        closed: '0',
        eligible_total: '0',
        avg_response_hours: null,
        sla_total: '0',
        sla_met: '0',
      });
      const { stats } = await service.getDashboardData('manager');
      expect(stats.avgResponseHours).toBeNull();
      expect(stats.resolutionRate).toBeNull();
      expect(stats.slaCompliance).toBeNull();
    });

    it('preserves genuine zero durations and zero percentages', async () => {
      // A measured zero is valid data and must remain distinct from a missing sample.
      model.findDashboardStats.mockResolvedValue({
        open: '1',
        overdue: '0',
        resolved: '0',
        closed: '0',
        eligible_total: '1',
        avg_response_hours: '0',
        sla_total: '1',
        sla_met: '0',
      });
      const { stats } = await service.getDashboardData('manager');
      expect(stats.avgResponseHours).toBe('0.0');
      expect(stats.resolutionRate).toBe('0.0');
      expect(stats.slaCompliance).toBe('0.0');
    });
  });
});

describe('Dashboard activity', () => {
  const model = require('../reporting.model');
  const service = require('../reporting.service');

  describe('Dashboard activity presentation', () => {
    beforeEach(() => {
      jest.restoreAllMocks();
      jest
        .spyOn(model, 'findManagedDepartment')
        .mockResolvedValue({ id: 'department', name: 'Utilities' });
      jest.spyOn(model, 'findDashboardStats').mockResolvedValue({
        open: '0',
        overdue: '0',
        resolved: '0',
        closed: '0',
        eligible_total: '0',
        avg_response_hours: null,
        sla_total: '0',
        sla_met: '0',
      });
      jest.spyOn(model, 'findRecentActivity');
    });

    afterEach(() => jest.restoreAllMocks());

    it('labels recorded events and preserves the database order and timestamp', async () => {
      // Exercise each supported event shape and ensure presentation does not reorder its source rows.
      model.findRecentActivity.mockResolvedValue([
        {
          event_type: 'comment',
          comment_type: 'RESOLUTION',
          actor: 'Staff',
          timestamp: '2026-10-11 14:30',
        },
        { event_type: 'assignment', assignee: 'New Staff' },
        { event_type: 'assignment', assignee: null },
        { event_type: 'status', event_status: 'IN_PROGRESS' },
        { event_type: 'submission' },
      ]);
      const { recentActivity } = await service.getDashboardData('manager');
      expect(recentActivity.map((event) => event.label)).toEqual([
        'Resolution comment added',
        'Assigned to New Staff',
        'Assignment removed',
        'Status changed to In Progress',
        'Request submitted',
      ]);
      expect(recentActivity[0].timestamp).toBe('2026-10-11 14:30');
      expect(recentActivity[0].actor).toBe('Staff');
      expect(recentActivity[4].actor).toBe('Unknown user');
      expect(model.findRecentActivity).toHaveBeenCalledWith('manager', 'department');
    });
  });
});

describe('Contact access inbox', () => {
  const path = require('path');
  const express = require('express');
  const request = require('supertest');
  const { query } = require('../../../config/database');
  const routes = require('../reporting.routes');

  const inboxPath = '/manager/contact-access-requests';
  const managerId = '11111111-1111-4111-8111-111111111111';
  const manager = {
    id: managerId,
    role: 'management',
    name: 'Test Manager',
    email: 'manager@example.com',
    avatarInitials: 'TM',
    departmentId: 'stale-department',
  };
  const viewRoots = [
    path.resolve(__dirname, '../..'),
    path.resolve(__dirname, '../../../shared/views'),
  ];

  const createApp = (user) => {
    const app = express();
    app.set('view engine', 'ejs');
    app.set('views', viewRoots);
    app.use((req, res, next) => {
      req.session = { user };
      next();
    });
    app.use(routes);
    // eslint-disable-next-line no-unused-vars
    app.use((error, req, res, next) => res.status(500).send('Database unavailable'));
    return app;
  };

  beforeEach(() => query.mockReset());

  it.each(['staff', 'requester', 'admin', 'operator'])('rejects the %s role', async (role) => {
    expect((await request(createApp({ ...manager, role })).get(inboxPath)).status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('denies a manager who does not own an active department', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const response = await request(createApp(manager)).get(inboxPath);
    expect(response.status).toBe(403);
    expect(response.text).not.toContain('Incoming Contact Access Requests');
  });

  it('handles database failures without exposing their details', async () => {
    query.mockRejectedValueOnce(new Error('private database failure'));
    const response = await request(createApp(manager)).get(inboxPath);
    expect(response.status).toBe(500);
    expect(response.text).not.toContain('private database failure');
  });
});
