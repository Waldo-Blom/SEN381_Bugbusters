require('dotenv').config();
const app = require('./app');
const { testConnection, closePool } = require('./config/database');

const PORT = process.env.PORT || 3000;

(async () => {
  try {
    await testConnection();

    const server = app.listen(PORT, () => {
      console.log(`CivicConnect running at http://localhost:${PORT}`);
    });

    // Shutdown
    const shutdown = async (signal) => {
      console.log(`\n${signal} received. Shutting down ...`);
      server.close(async () => {
        await closePool();
        console.log('Server and DB pool closed.');
        process.exit(0);
      });
    };

    process.on('SIGINT',  () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
})();