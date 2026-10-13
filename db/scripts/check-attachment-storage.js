// Read-only development configuration check. Does not upload objects or modify records.
require('dotenv').config({ quiet: true });
const { S3Client, HeadBucketCommand } = require('@aws-sdk/client-s3');

const check = async () => {
  const endpoint = 'https://br-cold-queen-b59z51fw.storage.c-7.us-east-2.aws.neon.tech';
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.AWS_ENDPOINT_URL_S3 !== endpoint ||
    process.env.STORAGE_BUCKET !== 'civicconnect-attachments' ||
    new URL(process.env.DATABASE_URL || '').pathname !== '/civicconnect_dev'
  ) {
    throw new Error('This check requires the supplied development database, endpoint and bucket.');
  }
  const { pool } = require('../../src/config/database');
  const client = new S3Client({
    endpoint,
    region: process.env.AWS_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
    maxAttempts: 1,
    requestHandler: { connectionTimeout: 5000, requestTimeout: 15000 },
  });
  try {
    const database = await pool.query('SELECT current_database() AS name');
    if (database.rows[0].name !== 'civicconnect_dev') throw new Error('Unexpected database.');
    const columns = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'request_attachments'`
    );
    const required = [
      'attachment_id',
      'request_id',
      'file_name',
      'file_path',
      'file_size_bytes',
      'file_extension_type',
      'uploaded_by',
      'uploaded_at',
    ];
    if (!required.every((column) => columns.rows.some((row) => row.column_name === column)))
      throw new Error('Required attachment columns are unavailable.');
    console.log('Development database connection and existing attachment columns: OK');
    const attachmentModel = require('../../src/modules/requests/requests.attachments.model');
    // EXPLAIN checks the actual SQL/types without executing or locking a request.
    await attachmentModel.findAccess(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      { query: (sql, params) => pool.query(`EXPLAIN ${sql}`, params) },
      true
    );
    console.log('Attachment authorisation query: OK');
    await client.send(new HeadBucketCommand({ Bucket: process.env.STORAGE_BUCKET }));
    console.log('Development attachment bucket access: OK');
  } finally {
    client.destroy();
    await pool.end();
  }
};

check().catch((error) => {
  // Avoid printing SDK/connection objects that might include credentials.
  console.error('Development attachment configuration check failed:', error.code || error.name);
  if (error.code === '22P02') console.error('Attachment query type mismatch:', error.message);
  process.exitCode = 1;
});
