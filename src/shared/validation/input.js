'use strict';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isValidEmail(value) {
  return typeof value === 'string' && value.length <= 255 && EMAIL_PATTERN.test(value);
}

module.exports = { normalizeEmail, isValidEmail };
