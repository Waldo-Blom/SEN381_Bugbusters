// Exercise multipart routes, image decoding, request transactions and metadata persistence.
// Storage and PostgreSQL are mocked; these tests never write to a Neon branch.
jest.mock('../../src/config/database', () => ({ query: jest.fn(), pool: { connect: jest.fn() } }));
jest.mock('../../src/config/object-storage', () => ({
  upload: jest.fn(),
  remove: jest.fn(),
  downloadUrl: jest.fn(),
}));
const express = require('express');
const path = require('path');
const request = require('supertest');
const sharp = require('sharp');
const db = require('../../src/config/database');
const storage = require('../../src/config/object-storage');
const routes = require('../../src/modules/requests/requests.routes');
const requestId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const categoryId = '33333333-3333-4333-8333-333333333333';
const attachmentId = '44444444-4444-4444-8444-444444444444';
const otherId = '55555555-5555-4555-8555-555555555555';
const csrf = 'test-upload-csrf';
let records, client, png, failInsert, allowedViewer, contextExists;

const appFor = (role = 'requester', id = actorId) => {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', [
    path.resolve(__dirname, '../../src/modules'),
    path.resolve(__dirname, '../../src/shared/views'),
  ]);
  app.use(express.urlencoded({ extended: true }));
  app.use((req, res, next) => {
    req.session = {
      user: role ? { id, role, email: `${role}@test.example`, name: 'Test User' } : null,
      csrfToken: csrf,
    };
    next();
  });
  app.use(routes);
  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => res.status(500).send('Request could not be saved.'));
  return app;
};
const fields = (req) =>
  req
    .field('_csrf', csrf)
    .field('categoryId', categoryId)
    .field('title', 'Broken pipe')
    .field('description', 'Pipe is leaking.')
    .field('location', 'Main Street');

beforeEach(async () => {
  jest.resetAllMocks();
  records = [];
  failInsert = false;
  allowedViewer = true;
  contextExists = true;
  const execute = async (sql, params = []) => {
    if (sql.includes('SELECT r.request_id, r.requester_id, r.created_by')) {
      return {
        rows: contextExists
          ? [
              {
                request_id: requestId,
                allowed: allowedViewer && params[1] === actorId,
                can_upload: allowedViewer && params[1] === actorId,
              },
            ]
          : [],
      };
    }
    if (sql.includes('COUNT(*)::int AS count FROM request_attachments'))
      return { rows: [{ count: records.length }] };
    if (sql.includes('INSERT INTO request_attachments')) {
      if (failInsert) throw new Error('Metadata insertion failed');
      records.push({
        id: attachmentId,
        requestId: params[0],
        name: params[1],
        key: params[2],
        size: params[3],
        extension: params[4],
        uploadedBy: params[5],
      });
      return { rows: [{ attachment_id: attachmentId }] };
    }
    if (sql.includes('SELECT file_path'))
      return {
        rows: records
          .filter((r) => r.requestId === params[0] && r.id === params[1])
          .map((r) => ({ file_path: r.key, file_extension_type: r.extension })),
      };
    if (sql.includes('SELECT attachment_id AS id'))
      return {
        rows: records
          .filter((r) => r.requestId === params[0])
          .map(({ id, name, size, extension }) => ({ id, name, size, extension })),
      };
    if (sql.includes('last_sequence')) return { rows: [{ last_sequence: 0 }] };
    if (sql.includes('INSERT INTO service_requests'))
      return {
        rows: [
          {
            request_id: requestId,
            request_number: 'CC-2026-0001',
            status: 'SUBMITTED',
            created_at: new Date(),
          },
        ],
      };
    if (sql.includes('INSERT INTO external_requesters'))
      return { rows: [{ external_requester_id: otherId }] };
    if (sql.includes('FROM request_categories'))
      return { rows: [{ id: categoryId, name: 'Leaks' }] };
    if (sql === 'ROLLBACK') records = [];
    return { rows: [] };
  };
  db.query.mockImplementation(execute);
  client = { query: jest.fn(execute), release: jest.fn() };
  db.pool.connect.mockResolvedValue(client);
  storage.downloadUrl.mockResolvedValue('https://private-storage.test/signed-image');
  png = await sharp({ create: { width: 3, height: 3, channels: 3, background: 'blue' } })
    .png()
    .toBuffer();
});

test('creates a request and associates a selected image with the returned request ID', async () => {
  const response = await fields(request(appFor()).post('/requester/submit')).attach(
    'images',
    png,
    'pipe.png'
  );
  expect(response.status).toBe(302);
  expect(response.headers.location).toBe('/requester/my-requests');
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    requestId,
    uploadedBy: actorId,
    name: 'pipe.png',
    extension: 'png',
  });
  expect(records[0].key).toMatch(new RegExp(`^requests/${requestId}/[a-f0-9-]+\\.png$`));
  expect(records[0].key).not.toContain('https://');
  expect(client.query).toHaveBeenCalledWith('COMMIT');
  const calls = client.query.mock.calls;
  expect(calls.findIndex(([sql]) => sql.includes('INSERT INTO service_requests'))).toBeLessThan(
    calls.findIndex(([sql]) => sql.includes('INSERT INTO request_attachments'))
  );
});

test('keeps image-free multipart and existing urlencoded submissions working', async () => {
  expect((await fields(request(appFor()).post('/requester/submit'))).status).toBe(302);
  expect(
    (
      await request(appFor()).post('/requester/submit').type('form').send({
        categoryId,
        title: 'Broken pipe',
        description: 'Pipe is leaking.',
        location: 'Main Street',
      })
    ).status
  ).toBe(302);
  expect(storage.upload).not.toHaveBeenCalled();
});

test('records the authenticated operator as uploader rather than the external requester', async () => {
  const response = await fields(request(appFor('operator')).post('/operator/submit'))
    .field('externalFirstName', 'Jane')
    .field('externalLastName', 'Citizen')
    .field('externalEmail', 'jane@example.test')
    .field('preferredContactMethod', 'EMAIL')
    .field('uploaded_by', otherId)
    .attach('images', png, 'pipe.png');
  expect(response.status).toBe(302);
  expect(records[0].uploadedBy).toBe(actorId);
  const insert = client.query.mock.calls.find(([sql]) =>
    sql.includes('INSERT INTO service_requests')
  );
  expect(insert[1][1]).toBeNull();
  expect(insert[1][2]).toBe(otherId);
});

test.each([
  ['fake image', Buffer.from('not an image'), 'fake.png', 400],
  ['oversized image', Buffer.alloc(5 * 1024 * 1024 + 1), 'large.png', 413],
])('rejects %s without creating a request', async (_name, buffer, name, status) => {
  const response = await fields(request(appFor()).post('/requester/submit')).attach(
    'images',
    buffer,
    name
  );
  expect(response.status).toBe(status);
  expect(db.pool.connect).not.toHaveBeenCalled();
  expect(storage.upload).not.toHaveBeenCalled();
});

test.each([
  ['requester', otherId, 403],
  ['operator', otherId, 403],
  ['staff', otherId, 403],
  ['management', otherId, 403],
  [null, actorId, 401],
])('denies attachment retrieval for unauthorised %s', async (role, id, status) => {
  const response = await request(appFor(role, id)).get(
    `/requests/${requestId}/attachments/${attachmentId}`
  );
  expect(response.status).toBe(status);
  expect(storage.downloadUrl).not.toHaveBeenCalled();
});

test.each(['staff', 'management'])(
  'allows an authorised %s to view images but not upload them',
  async (role) => {
    records.push({
      id: attachmentId,
      requestId,
      key: `requests/${requestId}/image.png`,
      extension: 'png',
    });
    expect(
      (await request(appFor(role)).get(`/requests/${requestId}/attachments/${attachmentId}`)).status
    ).toBe(302);
    expect(
      (
        await request(appFor(role))
          .post(`/requests/${requestId}/attachments`)
          .field('_csrf', csrf)
          .attach('images', png, 'pipe.png')
      ).status
    ).toBe(403);
  }
);

test('uploads additional images to an existing owned request', async () => {
  const response = await request(appFor())
    .post(`/requests/${requestId}/attachments`)
    .field('_csrf', csrf)
    .attach('images', png, 'pipe.png');
  expect(response.status).toBe(302);
  expect(response.headers.location).toBe(`/requester/requests/${requestId}`);
  expect(records[0].uploadedBy).toBe(actorId);
});
