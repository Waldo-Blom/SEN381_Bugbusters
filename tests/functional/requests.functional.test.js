describe('Request workflows — black-box functional plans', () => {
  // FR-101, EP: valid request details should create a request and return a unique reference.
  // Input: a valid category, title, description, location, and requester contact details.
  // Expected: submission is accepted once and the returned reference identifies the new request.
  test.todo('FR-101 accepts valid request details and returns a unique request reference');

  // FR-101, BVA/negative: omit each required field in turn and submit an unsupported category.
  // Expected: each invalid submission is rejected with field-level feedback and creates no request.
  test.todo('FR-101 rejects missing required fields and an unsupported request category');

  // FR-102, EP: compare a known request reference with an unknown reference.
  // Expected: the known reference shows its current status; an unknown reference shows a safe not-found response.
  test.todo(
    'FR-102 displays status for a known request reference and handles an unknown reference'
  );

  // FR-103, decision/access: compare a signed-in requester with a signed-out user.
  // Expected: the requester sees only their own request history; signed-out users are redirected to login.
  test.todo('FR-103 limits request history to the authenticated requester');

  // FR-105, EP: submit valid registration fields, then attempt login with valid and invalid credentials.
  // Expected: a valid account can log in; an incorrect password is rejected without authenticating.
  test.todo(
    'FR-105 registers a requester and accepts valid credentials while rejecting an invalid password'
  );
});
