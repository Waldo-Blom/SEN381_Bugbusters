const secret = process.env.SESSION_SECRET;

if (!secret) {
  throw new Error('SESSION_SECRET is not defined in your environment');
}

module.exports = {
  secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000,
  },
};
