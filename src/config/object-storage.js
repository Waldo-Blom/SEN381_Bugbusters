const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// Resolve lazily so requests without images still work when storage is not configured.
const configuration = () => {
  const {
    AWS_ENDPOINT_URL_S3: endpoint,
    AWS_REGION: region,
    AWS_ACCESS_KEY_ID: accessKeyId,
    AWS_SECRET_ACCESS_KEY: secretAccessKey,
    STORAGE_BUCKET: bucket,
  } = process.env;
  if (!endpoint || !region || !accessKeyId || !secretAccessKey || !bucket)
    throw Object.assign(new Error('Image storage is not configured.'), {
      code: 'STORAGE_NOT_CONFIGURED',
    });
  if (new URL(endpoint).protocol !== 'https:') throw new Error('Image storage requires HTTPS.');
  return {
    bucket,
    client: new S3Client({
      endpoint,
      region,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
      maxAttempts: 2,
      requestHandler: { connectionTimeout: 5000, requestTimeout: 15000 },
    }),
  };
};

const execute = async (command) => {
  const { client, bucket } = configuration();
  try {
    return await client.send(command(bucket));
  } finally {
    client.destroy();
  }
};

exports.upload = (key, body, contentType) =>
  execute(
    (bucket) =>
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: 'private, no-store',
      })
  );
exports.remove = (key) =>
  execute((bucket) => new DeleteObjectCommand({ Bucket: bucket, Key: key }));
exports.downloadUrl = async (key, contentType) => {
  const { client, bucket } = configuration();
  try {
    return await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentType: contentType,
        ResponseContentDisposition: 'inline',
        ResponseCacheControl: 'private, no-store',
      }),
      { expiresIn: 60 }
    );
  } finally {
    client.destroy();
  }
};
