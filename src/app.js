require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path    = require('path');

const pageRoutes      = require('./routes/pageRoutes');
const authRoutes      = require('./routes/authRoutes');
const requesterRoutes = require('./routes/requesterRoutes');
const staffRoutes     = require('./routes/staffRoutes');
const managerRoutes   = require('./routes/managerRoutes');

const app = express();

// Set EJS as the templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
}));

// Make the logged-in user available to every EJS view as `user`
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Routes
app.use('/',          pageRoutes);       // Landing page
app.use('/auth',      authRoutes);       // Login / Signup / Logout
app.use('/requester', requesterRoutes);  // Requester-only area
app.use('/staff',     staffRoutes);      // Staff-only area
app.use('/manager',   managerRoutes);    // Manager-only area


// // TEMP route to deliberately throw a 500 error for testing
// app.get('/_test-500', (req, res) => {
//   throw new Error('Deliberate test error — this is expected');
// });

// 404 & Error handlers
app.use((req, res) => res.status(404).render('pages/404', { title: 'Not Found' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('pages/500', { title: 'Server Error' });
});



module.exports = app;