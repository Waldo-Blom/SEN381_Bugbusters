const { randomBytes, timingSafeEqual } = require('crypto');
const { sendHttpError } = require('./error.middleware');

const getCsrfToken = (req) => {
  if (!req.session.csrfToken) req.session.csrfToken = randomBytes(32).toString('hex');
  return req.session.csrfToken;
};

const requireCsrf = (req, res, next) => {
  const provided = req.body?._csrf;
  const expected = req.session?.csrfToken;
  if (typeof provided !== 'string' || typeof expected !== 'string') {
    return sendHttpError(req, res, 403, 'Please reload the page and try again.');
  }
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return sendHttpError(req, res, 403, 'Please reload the page and try again.');
  }
  next();
};

module.exports = { getCsrfToken, requireCsrf };
