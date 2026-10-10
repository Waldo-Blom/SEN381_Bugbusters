describe('Request workflow — regression plans', () => {
  // FR-202: guard the workflow rule that prevents jumping directly from Submitted to Resolved.
  // Expected: the invalid transition remains rejected and does not update the stored request.
  test.todo('FR-202 keeps direct Submitted-to-Resolved transitions rejected');

  // FR-204: guard the resolution-comment requirement when an In Progress request is resolved.
  // Expected: a missing comment remains rejected and the request stays In Progress.
  test.todo('FR-204 keeps resolution blocked when its required comment is missing');
});
