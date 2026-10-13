const { normalizeEmail, isValidEmail } = require('../../shared/validation/input');

const validateRegistration = (body = {}) => {
  const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : '';
  const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : '';
  const email = normalizeEmail(body.email);
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const termsAccepted = body.terms === 'on' || body.terms === 'true';
  const errors = [];

  if (!firstName || firstName.length > 100) {
    errors.push('Enter a first name (up to 100 characters).');
  }
  if (!lastName || lastName.length > 100) {
    errors.push('Enter a last name (up to 100 characters).');
  }
  if (!isValidEmail(email)) {
    errors.push('Enter a valid email address.');
  }
  if (phone.length > 15) {
    errors.push('Phone number must be 15 characters or fewer.');
  }
  if (!termsAccepted) {
    errors.push('You must accept the Terms of Service and Privacy Policy.');
  }
  if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    errors.push(
      'Password must be at least 8 characters, include an uppercase letter and a number.'
    );
  }
  return {
    errors,
    values: { firstName, lastName, email, phone, password, termsAccepted },
  };
};

const validateLogin = (body = {}) => {
  const email = normalizeEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  const errors = [];

  if (!isValidEmail(email)) {
    errors.push('Enter a valid email address.');
  }
  if (!password) {
    errors.push('Enter your password.');
  }

  return { errors, values: { email, password } };
};

module.exports = { validateRegistration, validateLogin };
