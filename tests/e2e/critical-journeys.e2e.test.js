// Suggested test scenarios, updated by Waldo. These options may change in the
// future; they are the suggested approach for now.

describe('CivicConnect — end-to-end system plans', () => {
  // FR-101, FR-102: submit a valid service request through the requester UI and use its generated reference.
  // Expected: submission confirmation displays a reference and the tracking journey shows the saved status.
  test.todo('FR-101/FR-102 requester submits a service request and tracks its generated reference');

  // FR-201, FR-202, FR-204, FR-206: staff assign, start, resolve with a comment, then close a request.
  // Expected: each permitted action is reflected in the UI and the final request state is Closed.
  test.todo('FR-201/FR-202/FR-204/FR-206 staff completes the permitted request lifecycle');
});
