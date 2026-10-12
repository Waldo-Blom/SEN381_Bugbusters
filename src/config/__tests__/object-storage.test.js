jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(),
  PutObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
}));
jest.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: jest.fn() }));
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const storage = require('../object-storage');
let originalEnv, client;
beforeEach(() => {
  jest.resetAllMocks();
  originalEnv = process.env;
  process.env = {
    ...originalEnv,
    AWS_ENDPOINT_URL_S3: 'https://development.storage.test',
    AWS_REGION: 'us-east-2',
    AWS_ACCESS_KEY_ID: 'test-id',
    AWS_SECRET_ACCESS_KEY: 'test-secret',
    STORAGE_BUCKET: 'civicconnect-attachments',
  };
  client = { send: jest.fn().mockResolvedValue({}), destroy: jest.fn() };
  S3Client.mockImplementation(() => client);
});
afterEach(() => {
  process.env = originalEnv;
});

test('uses the configured private bucket, endpoint and path-style S3 addressing', async () => {
  const body = Buffer.from('image');
  await storage.upload('requests/request/image.png', body, 'image/png');
  expect(S3Client).toHaveBeenCalledWith(
    expect.objectContaining({
      endpoint: 'https://development.storage.test',
      region: 'us-east-2',
      forcePathStyle: true,
      credentials: { accessKeyId: 'test-id', secretAccessKey: 'test-secret' },
    })
  );
  expect(PutObjectCommand).toHaveBeenCalledWith(
    expect.objectContaining({
      Bucket: 'civicconnect-attachments',
      Key: 'requests/request/image.png',
      Body: body,
      ContentType: 'image/png',
    })
  );
  expect(PutObjectCommand.mock.calls[0][0].ACL).toBeUndefined();
  expect(client.destroy).toHaveBeenCalled();
});

test('signs downloads for only 60 seconds and disables browser caching', async () => {
  getSignedUrl.mockResolvedValue('https://test/signed');
  expect(await storage.downloadUrl('requests/request/image.png', 'image/png')).toBe(
    'https://test/signed'
  );
  expect(GetObjectCommand).toHaveBeenCalledWith(
    expect.objectContaining({
      ResponseContentType: 'image/png',
      ResponseCacheControl: 'private, no-store',
    })
  );
  expect(getSignedUrl).toHaveBeenCalledWith(client, expect.anything(), { expiresIn: 60 });
});

test('removes failed objects using the configured bucket', async () => {
  await storage.remove('requests/request/image.png');
  expect(DeleteObjectCommand).toHaveBeenCalledWith({
    Bucket: 'civicconnect-attachments',
    Key: 'requests/request/image.png',
  });
});

test('fails clearly when credentials are missing without falling back to another account', async () => {
  delete process.env.AWS_ACCESS_KEY_ID;
  await expect(storage.upload('key', Buffer.from('data'), 'image/png')).rejects.toThrow(
    'not configured'
  );
  expect(S3Client).not.toHaveBeenCalled();
});
