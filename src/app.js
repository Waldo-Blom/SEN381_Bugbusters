require('dotenv').config({ quiet: true });
const express = require('express');
const session = require('express-session');
const path = require('path');

const registerModules = require('./modules');

const app = express();

// Set EJS as the templating engine.
// Views live inside each module, plus shared layouts/partials/errors.
app.set('view engine', 'ejs');
app.set('views', [path.join(__dirname, 'modules'), path.join(__dirname, 'shared/views')]);

// Serve static files from the root-level 'public' directory
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);

// Make the logged-in user available to every EJS view as `user`
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Routes: each module declares its own paths (see modules/index.js)
registerModules(app);

// Health check for CI
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
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
