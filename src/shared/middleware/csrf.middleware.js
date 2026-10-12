const { randomBytes, timingSafeEqual } = require('crypto');

const getCsrfToken = (req) => {
  if (!req.session.csrfToken) req.session.csrfToken = randomBytes(32).toString('hex');
  return req.session.csrfToken;
};

const requireCsrf = (req, res, next) => {
  const provided = req.body?._csrf;
  const expected = req.session?.csrfToken;
  if (typeof provided !== 'string' || typeof expected !== 'string') {
    return res.status(403).send('Please reload the page and try again.');
  }
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return res.status(403).send('Please reload the page and try again.');
  }
  next();
};

module.exports = { getCsrfToken, requireCsrf };
