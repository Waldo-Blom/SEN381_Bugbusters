'use strict';

/** Run database work in a transaction and always release its client. */
async function withTransaction(pool, operation, options = {}) {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query('BEGIN');
    transactionStarted = true;
    const result = await operation(client);
    await client.query('COMMIT');
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        // Preserve the original failure; rollback diagnostics are logged separately.
        console.error('[database] Transaction rollback failed:', rollbackError);
      }
    }

    if (options.onRollback) {
      try {
        await options.onRollback(error, client);
      } catch (cleanupError) {
        console.error('[database] Transaction cleanup failed:', cleanupError);
      }
    }

    throw error;
  } finally {
    client.release();
  }
}

module.exports = { withTransaction };
