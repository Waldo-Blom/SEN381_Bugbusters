'use strict';

const HttpError = require('../errors/httpError');

/** Validate one request source using a schema returning { errors, value|values }. */
function validate(schema, options = {}) {
  if (typeof schema !== 'function') throw new TypeError('Validation schema must be a function.');
  const source = options.source || 'body';
  const target = options.target || 'validated';

  return (req, res, next) => {
    const result = schema(req[source] || {});
    const errors = result?.errors || {};
    const invalid = Array.isArray(errors) ? errors.length > 0 : Object.keys(errors).length > 0;

    req[target] = result?.value ?? result?.values ?? req[source];
    req.validation = { ...(req.validation || {}), [source]: { errors, value: req[target] } };
    if (invalid && options.throwOnError !== false) {
      const message = Array.isArray(errors) ? errors.join(' ') : Object.values(errors).join(' ');
      return next(new HttpError(400, message || 'Please check the submitted information.'));
    }
    return next();
  };
}

function sanitizeValue(value, key = '') {
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, key));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [childKey, sanitizeValue(child, childKey)])
    );
  }
  if (typeof value !== 'string') return value;
  // Keep passwords byte-for-byte as entered; normalize other strings and remove control chars.
  if (/password|passphrase/i.test(key)) return value;
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
}

function sanitizeRequest(req, res, next) {
  if (req.body && typeof req.body === 'object') req.body = sanitizeValue(req.body);
  return next();
}

module.exports = { validate, sanitizeRequest, sanitizeValue };
