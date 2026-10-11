const secret = process.env.SESSION_SECRET;

if (!secret) {
  throw new Error('SESSION_SECRET is not defined in your environment');
}

// HTTP requests are independent, so the app otherwise cannot know that a user
// signed in on an earlier request. Express Session remembers the authenticated
// user's identity and role between requests, allowing pages to show their
// account-specific data and middleware to protect role-specific functionality.
// Session data stays on the server; the browser cookie contains only the signed
// session ID. With no store configured, Express uses its in-memory store, so
// sessions are cleared when this process restarts.
module.exports = {
  secret,
  // Save only changed sessions, and do not create sessions for anonymous visits.
  resave: false,
  saveUninitialized: false,
  cookie: {
    // Prevent client-side scripts from reading the session cookie.
    httpOnly: true,
    // Allow same-site navigation while reducing cross-site request exposure.
    sameSite: 'lax',
    // Send the cookie over HTTPS in production; keep local HTTP development usable.
    secure: process.env.NODE_ENV === 'production',
    // Require the user to sign in again after eight hours.
    maxAge: 8 * 60 * 60 * 1000,
  },
};
