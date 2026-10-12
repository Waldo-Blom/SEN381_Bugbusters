jest.mock('../../../config/database', () => ({ query: jest.fn(), pool: { connect: jest.fn() } }));
jest.mock('../../../config/object-storage', () => ({
  upload: jest.fn(),
  remove: jest.fn(),
  downloadUrl: jest.fn(),
}));
jest.mock('../requests.attachments.model');
const sharp = require('sharp');
const { pool } = require('../../../config/database');
const model = require('../requests.attachments.model');
const storage = require('../../../config/object-storage');
const service = require('../requests.attachments.service');
const requestId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const attachmentId = '33333333-3333-4333-8333-333333333333';
let client;
let file;
beforeEach(async () => {
  jest.resetAllMocks();
  client = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
  pool.connect.mockResolvedValue(client);
  model.findAccess.mockResolvedValue({ allowed: true, can_upload: true });
  model.count.mockResolvedValue(0);
  model.insert.mockResolvedValue({ attachment_id: attachmentId });
  model.list.mockResolvedValue([]);
  file = {
    originalname: 'photo.png',
    mimetype: 'image/png',
    buffer: await sharp({ create: { width: 2, height: 2, channels: 3, background: 'red' } })
      .png()
      .toBuffer(),
  };
});

test('uploads with a generated key and stores metadata with the authenticated actor', async () => {
  await service.add(requestId, userId, [file]);
  const [key, buffer, contentType] = storage.upload.mock.calls[0];
  expect(key).toMatch(new RegExp(`^requests/${requestId}/[a-f0-9-]+\\.png$`));
  expect(contentType).toBe('image/png');
  expect(model.insert).toHaveBeenCalledWith(
    client,
    requestId,
    userId,
    expect.objectContaining({ size: buffer.length, fileName: 'photo.png' }),
    key
  );
  expect(client.query).toHaveBeenCalledWith('COMMIT');
  expect(storage.remove).not.toHaveBeenCalled();
  expect(model.findAccess).toHaveBeenLastCalledWith(requestId, userId, client, true, undefined);
});

test('enforces the five-image limit against existing attachments under the request lock', async () => {
  model.count.mockResolvedValue(5);
  await expect(service.add(requestId, userId, [file])).rejects.toThrow('maximum of five');
  expect(storage.upload).not.toHaveBeenCalled();
  expect(client.query).toHaveBeenCalledWith('ROLLBACK');
});

test.each(['database', 'upload', 'commit'])(
  'cleans up objects after %s failure and never commits missing images',
  async (failure) => {
    if (failure === 'database') model.insert.mockRejectedValue(new Error('Insert failed'));
    if (failure === 'upload') storage.upload.mockRejectedValue(new Error('Upload failed'));
    if (failure === 'commit')
      client.query.mockImplementation(async (sql) => {
        if (sql === 'COMMIT') throw new Error('Commit failed');
        return { rows: [] };
      });
    await expect(service.add(requestId, userId, [file])).rejects.toThrow();
    expect(storage.remove).toHaveBeenCalledWith(storage.upload.mock.calls[0][0]);
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    if (failure === 'upload') expect(model.insert).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalled();
  }
);

test('cleans up the entire batch when a later upload fails', async () => {
  storage.upload.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('Second upload failed'));
  await expect(service.add(requestId, userId, [file, file])).rejects.toThrow();
  expect(storage.remove.mock.calls.map(([key]) => key)).toEqual(
    storage.upload.mock.calls.map(([key]) => key)
  );
  expect(client.query).not.toHaveBeenCalledWith('COMMIT');
});

test('cleanup failure is logged without replacing the original error', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  model.insert.mockRejectedValue(new Error('Original insert failure'));
  storage.remove.mockRejectedValue(new Error('Cleanup unavailable'));
  await expect(service.add(requestId, userId, [file])).rejects.toThrow('ATT-SAVE');
  expect(log).toHaveBeenCalledWith(
    expect.stringContaining('cleanup failed'),
    expect.stringContaining(`requests/${requestId}/`)
  );
  log.mockRestore();
});

test.each([null, { allowed: false }, { allowed: true, can_upload: false }])(
  'denies uploads when access is unavailable: %j',
  async (context) => {
    model.findAccess.mockResolvedValue(context);
    await expect(service.add(requestId, userId, [file])).rejects.toMatchObject({
      statusCode: context ? 403 : 404,
    });
    expect(storage.upload).not.toHaveBeenCalled();
  }
);

test('checks ownership before returning a signed download URL', async () => {
  const key = `requests/${requestId}/photo.png`;
  model.find.mockResolvedValue({ file_path: key, file_extension_type: 'png' });
  storage.downloadUrl.mockResolvedValue('https://storage.test/short-lived-url');
  expect(await service.downloadUrl(requestId, attachmentId, userId)).toBe(
    'https://storage.test/short-lived-url'
  );
  expect(model.findAccess).toHaveBeenCalledWith(requestId, userId, undefined, undefined, undefined);
  expect(model.find).toHaveBeenCalledWith(requestId, attachmentId);
  expect(storage.downloadUrl).toHaveBeenCalledWith(key, 'image/png');
});

test('denies retrieval before contacting storage when the viewer lacks request access', async () => {
  model.findAccess.mockResolvedValue({ allowed: false });
  await expect(service.downloadUrl(requestId, attachmentId, userId)).rejects.toMatchObject({
    statusCode: 403,
  });
  expect(model.find).not.toHaveBeenCalled();
  expect(storage.downloadUrl).not.toHaveBeenCalled();
});

test('rejects missing attachments and objects outside the request prefix', async () => {
  model.find.mockResolvedValue(null);
  await expect(service.downloadUrl(requestId, attachmentId, userId)).rejects.toMatchObject({
    statusCode: 404,
  });
  model.find.mockResolvedValue({
    file_path: 'requests/another-request/file.png',
    file_extension_type: 'png',
  });
  await expect(service.downloadUrl(requestId, attachmentId, userId)).rejects.toMatchObject({
    statusCode: 404,
  });
  expect(storage.downloadUrl).not.toHaveBeenCalled();
});

test('removes attachments and cleans up storage objects for authorised user', async () => {
  model.deleteByIds.mockResolvedValue([
    { id: attachmentId, file_path: `requests/${requestId}/test.png` },
  ]);
  storage.remove.mockResolvedValue();

  const deleted = await service.remove(requestId, userId, [attachmentId], 'requester');

  expect(model.findAccess).toHaveBeenCalledWith(requestId, userId, undefined, false, 'requester');
  expect(model.deleteByIds).toHaveBeenCalledWith(client, requestId, [attachmentId]);
  expect(client.query).toHaveBeenCalledWith('COMMIT');
  expect(storage.remove).toHaveBeenCalledWith(`requests/${requestId}/test.png`);
  expect(deleted).toHaveLength(1);
});

test('handles empty or non-uuid attachment removal requests gracefully', async () => {
  expect(await service.remove(requestId, userId, [], 'requester')).toEqual([]);
  expect(await service.remove(requestId, userId, ['not-a-uuid'], 'requester')).toEqual([]);
  expect(model.findAccess).not.toHaveBeenCalled();
});
