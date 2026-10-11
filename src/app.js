require('dotenv').config({ quiet: true });
const express = require('express');
const session = require('express-session');
const path = require('path');

const registerModules = require('./modules');
const { query } = require('./config/database');
const sessionConfig = require('./config/session');
const { getAuthenticatedUser } = require('./modules/auth/auth.middleware');

const app = express();

// Set EJS as the templating engine.
// Views live inside each module, plus shared layouts/partials/errors.
app.set('view engine', 'ejs');
app.set('views', [path.join(__dirname, 'modules'), path.join(__dirname, 'shared/views')]);

// Serve static files from the root-level 'public' directory
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

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

// 404 & Error handlers
app.use((req, res) => res.status(404).render('errors/404', { title: 'Not Found' }));

// Express only treats a handler as an error handler if it declares four arguments.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('errors/500', { title: 'Server Error' });
});

module.exports = app;
