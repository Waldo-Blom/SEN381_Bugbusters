const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

exports.validateSubmission = (input = {}) => {
  const errors = {};
  const value = (field) => (typeof input[field] === 'string' ? input[field].trim() : '');

  const categoryId = value('categoryId');
  const title = value('title');
  const description = value('description');
  const location = value('location');
  const priority = value('priority').toUpperCase() || 'MEDIUM';

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
