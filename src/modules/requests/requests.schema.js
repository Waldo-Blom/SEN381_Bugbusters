const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const CONTACT_METHODS = ['PHONE', 'EMAIL'];

const stringValue = (input, field) => (typeof input[field] === 'string' ? input[field].trim() : '');

exports.validateSubmission = (input = {}) => {
  const errors = {};
  const categoryId = stringValue(input, 'categoryId');
  const title = stringValue(input, 'title');
  const description = stringValue(input, 'description');
  const location = stringValue(input, 'location');
  const priority = stringValue(input, 'priority').toUpperCase() || 'MEDIUM';

  if (!categoryId) {
    errors.categoryId = 'Please select a category.';
  } else if (!UUID_PATTERN.test(categoryId)) {
    errors.categoryId = 'Please select a valid category.';
  }

  if (!title) {
    errors.title = 'Please enter a title.';
  } else if (title.length > 200) {
    errors.title = 'The title must be 200 characters or fewer.';
  }

  if (!description) {
    errors.description = 'Please enter a description.';
  }

  if (!location) {
    errors.location = 'Please enter a location.';
  } else if (location.length > 255) {
    errors.location = 'The location must be 255 characters or fewer.';
  }

  if (!ALLOWED_PRIORITIES.includes(priority)) {
    errors.priority = 'Please select a valid priority.';
  }

  return {
    errors,
    value: { categoryId, title, description, location, priority },
  };
};

exports.validateExternalRequester = (input = {}) => {
  const errors = {};
  const firstName = stringValue(input, 'externalFirstName');
  const lastName = stringValue(input, 'externalLastName');
  const phone = stringValue(input, 'externalPhone');
  const email = stringValue(input, 'externalEmail');
  const preferredContactMethod = stringValue(input, 'preferredContactMethod').toUpperCase();

  if (!firstName) {
    errors.externalFirstName = "Please enter the requester's first name.";
  } else if (firstName.length > 100) {
    errors.externalFirstName = 'The first name must be 100 characters or fewer.';
  }

  if (!lastName) {
    errors.externalLastName = "Please enter the requester's last name.";
  } else if (lastName.length > 100) {
    errors.externalLastName = 'The last name must be 100 characters or fewer.';
  }

  if (phone.length > 30) {
    errors.externalPhone = 'The phone number must be 30 characters or fewer.';
  }
  if (email && (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    errors.externalEmail = 'Please enter a valid email address (255 characters or fewer).';
  }
  if (!phone && !email) {
    errors.externalPhone = 'Enter at least one contact method: phone or email.';
    errors.externalEmail = errors.externalPhone;
  }

  if (!CONTACT_METHODS.includes(preferredContactMethod)) {
    errors.preferredContactMethod = 'Please select a preferred contact method.';
  } else if (preferredContactMethod === 'PHONE' && !phone) {
    errors.preferredContactMethod = 'A phone number is required for the preferred contact method.';
  } else if (preferredContactMethod === 'EMAIL' && !email) {
    errors.preferredContactMethod =
      'An email address is required for the preferred contact method.';
  }

  return {
    errors,
    value: {
      firstName,
      lastName,
      phone: phone || null,
      email: email || null,
      preferredContactMethod,
    },
  };
};
