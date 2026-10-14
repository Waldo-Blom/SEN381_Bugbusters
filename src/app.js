require('dotenv').config({ quiet: true });
const express = require('express');
const session = require('express-session');
const path = require('path');

const registerModules = require('./modules');
const { query } = require('./config/database');
const sessionConfig = require('./config/session');
const { getAuthenticatedUser } = require('./modules/auth/auth.middleware');
const { sanitizeRequest } = require('./shared/middleware/validate.middleware');
const { notFoundHandler, errorHandler } = require('./shared/middleware/error.middleware');

const app = express();

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Set EJS as the templating engine.
// Views live inside each module, plus shared layouts/partials/errors.
app.set('view engine', 'ejs');
app.set('views', [path.join(__dirname, 'modules'), path.join(__dirname, 'shared/views')]);

// Serve static files from the root-level 'public' directory
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(sanitizeRequest);

// Load the server-side session from the cookie's session ID before handling routes.
app.use(session(sessionConfig));

// Expose the authenticated user saved in that session to every EJS view.
app.use((req, res, next) => {
  res.locals.user = getAuthenticatedUser(req);
  next();
});

// Routes: each module declares its own paths (see modules/index.js)
registerModules(app);

// Health check for CI and deployment monitoring
app.get('/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.status(200).json({ status: 'ok', database: 'connected' });
  } catch (error) {
    console.error('Health check failed: PostgreSQL is unavailable:', error.message);
    res.status(503).json({ status: 'error', database: 'unavailable' });
  }
});

// // TEMP route to deliberately throw a 500 error for testing
// app.get('/_test-500', (req, res) => {
//   throw new Error('Deliberate test error — this is expected');
// });

// Keep these last so every module route uses the same not-found and error responses.
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
