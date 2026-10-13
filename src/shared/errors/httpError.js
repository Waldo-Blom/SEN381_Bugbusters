'use strict';

class HttpError extends Error {
  constructor(statusCode, message, options = {}) {
    super(message || 'The request could not be completed.');
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.expose = options.expose ?? statusCode < 500;
    if (options.cause) this.cause = options.cause;
    Error.captureStackTrace?.(this, HttpError);
  }
}

module.exports = HttpError;
