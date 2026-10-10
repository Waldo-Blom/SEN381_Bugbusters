// Suggested test scenarios, updated by Waldo. These options may change in the
// future; they are the suggested approach for now.

describe('Request workflows — API and database integration plans', () => {
  // FR-201: create an eligible unassigned request and assign it through the staff endpoint.
  // Expected: the API succeeds and a database read confirms the assigned staff member is persisted.
  test.todo('FR-201 persists staff ownership after assigning an unassigned request');

  // FR-202, state transition: move an assigned request to In Progress through the application workflow.
  // Expected: the stored status changes and a matching lifecycle-history row is written.
  test.todo('FR-202 persists an allowed status transition and its lifecycle history');

  // FR-204, negative: attempt to resolve an In Progress request without a resolution comment.
  // Expected: the operation is rejected and neither status nor lifecycle history is changed.
  test.todo('FR-204 rejects resolution without a comment and leaves the request unchanged');
});
