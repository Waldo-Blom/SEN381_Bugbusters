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
