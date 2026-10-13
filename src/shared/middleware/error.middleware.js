'use strict';

const HttpError = require('../errors/httpError');

function notFoundHandler(req, res, next) {
  return next(new HttpError(404, 'The page you are looking for could not be found.'));
}

function getErrorHeading(statusCode) {
  const headings = {
    400: 'Check your information',
    401: 'Please sign in to continue',
    403: 'You do not have access to this page',
    404: 'Page not found',
    409: 'This change could not be saved',
    413: 'This file is too large',
    429: 'Please wait a moment',
  };
  return headings[statusCode] || 'Something went wrong';
}

function respondWithError(req, res, err) {
  if (res.headersSent) return false;
  const statusCode = Number.isInteger(err.statusCode)
    ? err.statusCode
    : Number.isInteger(err.status)
      ? err.status
      : 500;
  const safeStatus = statusCode >= 400 && statusCode <= 599 ? statusCode : 500;
  const expose =
    safeStatus < 500 &&
    (err.expose === true ||
      (err.statusCode >= 400 && err.statusCode < 500) ||
      (err instanceof HttpError && err.expose));
  const message = expose
    ? err.message
    : safeStatus === 400
      ? 'The submitted request is invalid. Please check your information and try again.'
      : 'Something went wrong while processing your request. Please try again later.';

  // Expected client errors are common; keep their logs concise and reserve stacks for 5xx.
  const logMessage = `[request error] ${req.method} ${req.originalUrl} (${safeStatus}): ${message}`;
  if (safeStatus >= 500) console.error(logMessage, err);
  else console.warn(logMessage);

  const acceptHeader = req.get?.('Accept') || '';
  const wantsJson = req.xhr || acceptHeader.includes('application/json');
  if (!wantsJson && req.accepts?.('html') && !req.xhr && typeof res.render === 'function') {
    const view = safeStatus === 404 ? 'errors/404' : 'errors/500';
    res.status(safeStatus).render(view, {
      title: safeStatus === 404 ? 'Not Found' : 'Server Error',
      statusCode: safeStatus,
      heading: getErrorHeading(safeStatus),
      message,
    });
    return true;
  }

  if (typeof res.json === 'function') {
    res.status(safeStatus).json({ error: { status: safeStatus, message } });
  } else {
    res.status(safeStatus).send(message);
  }
  return true;
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  respondWithError(req, res, err);
}

function sendHttpError(req, res, statusCode, message) {
  return respondWithError(req, res, new HttpError(statusCode, message));
}

module.exports = { notFoundHandler, errorHandler, respondWithError, sendHttpError };
