jest.mock('../../../config/database', () => ({ query: jest.fn() }));

const path = require('path');
const express = require('express');
const request = require('supertest');
const ejs = require('ejs');
const { query } = require('../../../config/database');
const service = require('../reporting.service');
const routes = require('../reporting.routes');
const { managementNav, staffNav } = require('../../../shared/views/nav');

const inboxPath = '/manager/contact-access-requests';
const managerId = '11111111-1111-4111-8111-111111111111';
const department = { id: '22222222-2222-4222-8222-222222222222', name: 'Water and Sanitation' };
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

const viewContext = {
  title: 'Contact Access Requests',
  user: manager,
  navItems: managementNav,
  activeHref: inboxPath,
  roleLabel: 'Management Console',
  pageTitle: 'Contact Access Requests',
  pageSubtitle: 'Review staff requests for requester contact information',
  department,
};

beforeEach(() => query.mockReset());

it('adds the inbox to management navigation only', () => {
  expect(managementNav).toContainEqual({ href: inboxPath, label: 'Contact Access Requests' });
  expect(staffNav.some((item) => item.href === inboxPath)).toBe(false);
  expect(managementNav.map((item) => item.href)).toEqual([
    '/manager/dashboard',
    '/manager/requests',
    inboxPath,
    '/manager/reporting',
    '/manager/users',
  ]);
});

it('rejects signed-out viewers without accessing the database', async () => {
  expect((await request(createApp(null)).get(inboxPath)).status).toBe(401);
  expect(query).not.toHaveBeenCalled();
});

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

it('uses the existing department lookup and loads the department inbox', async () => {
  query.mockResolvedValueOnce({ rows: [department] });
  query.mockResolvedValueOnce({ rows: [] });
  const response = await request(createApp(manager)).get(
    `${inboxPath}?departmentId=foreign-department`
  );
  expect(response.status).toBe(200);
  expect(response.text).toContain(department.name);
  expect(response.text).toContain('Incoming Contact Access Requests');
  expect(response.text).toContain('No contact access requests to review.');
  expect(response.text).not.toMatch(/foreign-department|stale-department/);
  expect(query).toHaveBeenCalledTimes(2);
  expect(query).toHaveBeenCalledWith(expect.stringContaining('d.manager_id = $1'), [managerId]);
  const sql = query.mock.calls[0][0];
  expect(sql).toContain("u.user_type = 'MANAGER'");
  expect(sql).toContain('u.is_active = true');
  expect(sql).toContain('d.is_active = true');
  expect(query.mock.calls[1][1]).toEqual([managerId, department.id]);
  expect(query.mock.calls[1][0]).toContain('d.department_id = a.department_id');
});

it('does not look up a department without an authenticated ID', async () => {
  expect(await service.getContactAccessInbox(null)).toBeNull();
  expect(query).not.toHaveBeenCalled();
});

it('handles database failures without exposing their details', async () => {
  query.mockRejectedValueOnce(new Error('private database failure'));
  const response = await request(createApp(manager)).get(inboxPath);
  expect(response.status).toBe(500);
  expect(response.text).not.toContain('private database failure');
});

it('renders incoming entries safely and connects review forms', async () => {
  const html = await ejs.renderFile(
    path.join(__dirname, '../views/manager/contact-access-requests.ejs'),
    {
      ...viewContext,
      contactAccessRequestsEnabled: true,
      contactAccessCsrfToken: 'test-csrf-token',
      contactAccessRequests: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          canReview: true,
          requestId: '33333333-3333-4333-8333-333333333333',
          reference: 'CC-TEST-1',
          title: 'Broken pipe',
          staffName: 'Assigned Staff',
          reason: '<script>alert(1)</script>',
          requestedAt: '2026-10-11 09:00',
          status: 'Pending',
        },
      ],
    },
    { views: viewRoots }
  );
  expect(html).toContain('CC-TEST-1');
  expect(html).toContain('Assigned Staff');
  expect(html).toContain('/manager/requests/33333333-3333-4333-8333-333333333333');
  expect(html).not.toContain('<script>alert(1)</script>');
  expect(html).toContain('&lt;script&gt;');
  expect(html).toMatch(/<button type="submit"[^>]*>Approve<\/button>/);
  expect(html).toMatch(/<button type="submit"[^>]*>Reject<\/button>/);
  expect(html).toContain(
    '/manager/contact-access-requests/44444444-4444-4444-8444-444444444444/approve'
  );
  expect(html).toContain('test-csrf-token');
});

it.each([false, true])('connects direct contact controls with approval=%s', async (approved) => {
  const html = await ejs.renderFile(
    path.resolve(__dirname, '../../requests/views/manager/request-detail.ejs'),
    {
      ...viewContext,
      request: {
        contactInformationApproved: approved,
        id: '33333333-3333-4333-8333-333333333333',
        reference: 'CC-TEST-1',
        title: 'Broken pipe',
        status: 'Resolved',
        priority: 'Medium',
        description: 'Repair required',
        category: 'Leaks',
        department: department.name,
        location: '',
        submittedAt: '',
        updatedAt: '',
        assignedTo: 'Assigned Staff',
        requesterName: 'Citizen',
        requesterEmail: '',
        requesterPhone: '',
        createdBy: '',
        comments: [],
        timeline: [],
      },
    },
    { views: viewRoots }
  );
  expect(html).toContain(approved ? 'Revoke contact access' : 'Authorise contact access');
  expect(html).toContain(`/contact-access/${approved ? 'revoke' : 'authorise'}`);
  expect(html).toContain('Reassign');
  expect(html).toContain('Close Request');
});
