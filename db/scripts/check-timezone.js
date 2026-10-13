require('dotenv').config({ quiet: true });
const { Client } = require('pg');
const { pool, closePool } = require('../../src/config/database');
const { formatDate } = require('../../src/shared/datetime');

// Read-only diagnostics; never prints the connection string or personal data.
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
});
(async () => {
  try {
    const {
      rows: [clock],
    } = await pool.query(`SELECT now() AS instant,
      now() AT TIME ZONE 'UTC' AS legacy_timestamp,
      to_char(now() AT TIME ZONE 'Africa/Johannesburg', 'YYYY-MM-DD HH24:MI') AS south_africa_display`);
    if (
      clock.instant.getTime() !== clock.legacy_timestamp.getTime() ||
      formatDate(clock.legacy_timestamp) !== clock.south_africa_display
    ) {
      throw new Error('Application timestamp conversion differs from the database clock.');
    }
    console.log(`Application timestamp verified: ${formatDate(clock.legacy_timestamp)} SAST`);
    await client.connect();
    console.table(
      (
        await client.query(`SELECT current_setting('TimeZone') AS timezone,
      now()::text AS database_now,
      (now() AT TIME ZONE 'Africa/Johannesburg')::text AS south_africa_now`)
      ).rows
    );
    console.table(
      (
        await client.query(`SELECT table_name, column_name, data_type, column_default
      FROM information_schema.columns WHERE table_schema = 'public'
      AND data_type LIKE 'timestamp%' ORDER BY table_name, column_name`)
      ).rows
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await client.end();
    await closePool();
  }
})();
