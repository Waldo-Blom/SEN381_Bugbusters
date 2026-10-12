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

test('rejects six images without saving a request', async () => {
  let req = fields(request(appFor()).post('/requester/submit'));
  for (let i = 0; i < 6; i++) req = req.attach('images', png, `pipe-${i}.png`);
  expect((await req).status).toBe(400);
  expect(db.pool.connect).not.toHaveBeenCalled();
});

test('rolls back request creation and removes an object if metadata insertion fails', async () => {
  failInsert = true;
  const response = await fields(request(appFor()).post('/requester/submit')).attach(
    'images',
    png,
    'pipe.png'
  );
  expect(response.status).toBe(503);
  expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  expect(client.query).not.toHaveBeenCalledWith('COMMIT');
  expect(storage.remove).toHaveBeenCalledWith(storage.upload.mock.calls[0][0]);
  expect(records).toEqual([]);
  expect(response.text).toContain('please select them again');
});

test('does not insert attachment metadata when storage upload fails', async () => {
  storage.upload.mockRejectedValue(new Error('Storage unavailable'));
  const response = await fields(request(appFor()).post('/requester/submit')).attach(
    'images',
    png,
    'pipe.png'
  );
  expect(response.status).toBe(503);
  expect(
    client.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO request_attachments'))
  ).toBe(false);
  expect(client.query).toHaveBeenCalledWith('ROLLBACK');
});

test('lists images without exposing storage keys and issues a protected download redirect', async () => {
  await fields(request(appFor()).post('/requester/submit')).attach('images', png, 'pipe.png');
  const list = await request(appFor()).get(`/requests/${requestId}/attachments`);
  expect(list.status).toBe(200);
  expect(list.body[0]).toMatchObject({
    id: attachmentId,
    name: 'pipe.png',
    url: `/requests/${requestId}/attachments/${attachmentId}`,
  });
  expect(list.body[0].key).toBeUndefined();
  const response = await request(appFor()).get(
    `/requests/${requestId}/attachments/${attachmentId}`
  );
  expect(response.status).toBe(302);
  expect(response.headers.location).toBe('https://private-storage.test/signed-image');
  expect(response.headers['cache-control']).toContain('no-store');
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

test('protects multipart submission and additional uploads against missing CSRF tokens', async () => {
  const submit = await request(appFor())
    .post('/requester/submit')
    .field('categoryId', categoryId)
    .attach('images', png, 'pipe.png');
  expect(submit.status).toBe(403);
  const additional = await request(appFor())
    .post(`/requests/${requestId}/attachments`)
    .attach('images', png, 'pipe.png');
  expect(additional.status).toBe(403);
  expect(storage.upload).not.toHaveBeenCalled();
});

test('uploads additional images to an existing owned request', async () => {
  const response = await request(appFor())
    .post(`/requests/${requestId}/attachments`)
    .field('_csrf', csrf)
    .attach('images', png, 'pipe.png');
  expect(response.status).toBe(302);
  expect(response.headers.location).toBe(`/requester/requests/${requestId}`);
  expect(records[0].uploadedBy).toBe(actorId);
});

test('access query preserves department scope and validates active database users', async () => {
  await request(appFor()).get(`/requests/${requestId}/attachments`);
  const [sql, params] = db.query.mock.calls[0];
  expect(params).toEqual([requestId, actorId, 'requester']);
  expect(sql).toContain('viewer.is_active');
  expect(sql).toContain('r.requester_id = viewer.user_id');
  expect(sql).toContain('r.created_by = viewer.user_id');
  expect(sql).toContain('d.manager_id = viewer.user_id');
  expect(sql).toContain('sa.department_id = d.department_id AND sa.is_active = true');
  expect(sql).toContain("viewer.user_type::text IN ('OPERATOR', 'STAFF', 'ADMIN')");
  expect(sql).not.toContain("viewer.user_type = 'OPERATOR'");
});

test('explains a server permission-check failure without blaming a valid JPG or leaking SQL', async () => {
  const original = client.query.getMockImplementation();
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  client.query.mockImplementation(async (sql, params) => {
    if (sql.includes('SELECT r.request_id, r.requester_id, r.created_by')) {
      const error = new Error('invalid input value for enum user_type: OPERATOR');
      error.code = '22P02';
      throw error;
    }
    return original(sql, params);
  });
  const jpg = await sharp(png).jpeg().toBuffer();
  const response = await fields(request(appFor()).post('/requester/submit')).attach(
    'images',
    jpg,
    'small.jpg'
  );
  expect(response.status).toBe(503);
  expect(response.text).toContain('Your image passed validation');
  expect(response.text).toContain('ATT-PERMISSIONS');
  expect(response.text).toContain('Your request was not submitted');
  expect(response.text).not.toContain('invalid input value');
  expect(response.text).not.toContain('Please correct the following');
  expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  log.mockRestore();
});
