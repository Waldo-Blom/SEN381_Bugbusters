jest.mock('../../../config/database', () => ({ query: jest.fn(), pool: { connect: jest.fn() } }));
jest.mock('../../../config/object-storage', () => ({
  upload: jest.fn(),
  remove: jest.fn(),
  downloadUrl: jest.fn(),
}));
jest.mock('../requests.attachments.model');
// Attachment tests are grouped by boundary: upload validation, service/storage
// behavior, then validation of files before a request reaches persistence.
describe('Attachment error handling', () => {
  const { failure } = require('../requests.attachments.errors');
  let log;
  beforeEach(() => {
    log = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    log.mockRestore();
  });

  test.each([
    ['storage', { code: 'STORAGE_NOT_CONFIGURED' }, 'ATT-STORAGE-CONFIG'],
    ['storage', { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } }, 'ATT-STORAGE-ACCESS'],
    ['storage', { name: 'NoSuchBucket' }, 'ATT-STORAGE-BUCKET'],
    ['storage', { code: 'ETIMEDOUT' }, 'ATT-STORAGE-CONNECTION'],
    ['storage', { name: 'Error' }, 'ATT-STORAGE'],
    ['access', { code: '22P02' }, 'ATT-PERMISSIONS'],
    ['metadata', { code: '23503' }, 'ATT-SAVE'],
    ['request', { code: '08006' }, 'ATT-REQUEST-SAVE'],
  ])('explains %s failures with the safe reference %s', (stage, error, reference) => {
    const result = failure(stage, error);
    expect(result.statusCode).toBe(503);
    expect(result.reference).toBe(reference);
    expect(result.errors.attachments).toContain(reference);
    expect(log).toHaveBeenCalledWith('[attachments]', expect.objectContaining({ stage }));
  });

  test('never exposes raw SQL, credentials or SDK responses in the page or log', () => {
    const error = {
      code: '22P02',
      message: 'private SQL and credentials',
      connectionString: 'postgresql://private-password',
      $metadata: { httpStatusCode: 500 },
    };
    const result = failure('access', error);
    expect(JSON.stringify(result.errors)).not.toContain('private');
    expect(JSON.stringify(log.mock.calls)).not.toContain('private');
  });
});

describe('Attachment service and storage behavior', () => {
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
    storage.upload
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('Second upload failed'));
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
    expect(model.findAccess).toHaveBeenCalledWith(
      requestId,
      userId,
      undefined,
      undefined,
      undefined
    );
    expect(model.find).toHaveBeenCalledWith(requestId, attachmentId);
    expect(storage.downloadUrl).toHaveBeenCalledWith(key, 'image/png');
  });

  test('handles empty or non-uuid attachment removal requests gracefully', async () => {
    expect(await service.remove(requestId, userId, [], 'requester')).toEqual([]);
    expect(await service.remove(requestId, userId, ['not-a-uuid'], 'requester')).toEqual([]);
    expect(model.findAccess).not.toHaveBeenCalled();
  });
});

describe('Attachment validation', () => {
  const sharp = require('sharp');
  const { prepareImages, MAX_BYTES } = require('../requests.attachments.validation');

  const image = async (format = 'png') => ({
    originalname: `photo.${format === 'jpeg' ? 'jpg' : format}`,
    mimetype: `image/${format}`,
    buffer: await sharp({ create: { width: 3, height: 3, channels: 3, background: '#125abc' } })
      .toFormat(format)
      .toBuffer(),
  });

  test.each(['jpeg', 'png', 'webp'])(
    'decodes and accepts real %s image content',
    async (format) => {
      const [prepared] = await prepareImages([await image(format)]);
      expect(prepared.contentType).toBe(`image/${format}`);
      expect(prepared.size).toBe(prepared.buffer.length);
      expect((await sharp(prepared.buffer).metadata()).format).toBe(format);
    }
  );

  test('supports optional images and a maximum of five', async () => {
    expect(await prepareImages()).toEqual([]);
    const file = await image();
    expect(await prepareImages(Array(5).fill(file))).toHaveLength(5);
    await expect(prepareImages(Array(6).fill(file))).rejects.toMatchObject({ statusCode: 400 });
  });

  test.each([
    {
      originalname: 'fake.png',
      mimetype: 'image/png',
      buffer: Buffer.from('<script>alert(1)</script>'),
    },
    {
      originalname: 'fake.jpg',
      mimetype: 'image/jpeg',
      buffer: Buffer.from([255, 216, 255, 0, 1, 2]),
    },
    {
      originalname: 'fake.png',
      mimetype: 'image/png',
      buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    },
    { originalname: 'animation.gif', mimetype: 'image/gif', buffer: Buffer.from('GIF89a') },
    { originalname: 'empty.png', mimetype: 'image/png', buffer: Buffer.alloc(0) },
  ])('rejects unsupported or damaged content: $originalname', async (file) => {
    await expect(prepareImages([file])).rejects.toMatchObject({ statusCode: 400 });
  });

  test('rejects an incorrect extension or MIME type even with valid image pixels', async () => {
    const png = await image();
    await expect(prepareImages([{ ...png, originalname: 'fake.jpg' }])).rejects.toThrow(
      'matching file contents'
    );
    await expect(prepareImages([{ ...png, mimetype: 'image/jpeg' }])).rejects.toThrow(
      'matching file contents'
    );
  });

  test('rejects files larger than 5 MB before decoding', async () => {
    await expect(
      prepareImages([
        { originalname: 'big.png', mimetype: 'image/png', buffer: Buffer.alloc(MAX_BYTES + 1) },
      ])
    ).rejects.toMatchObject({ statusCode: 413 });
  });
});
