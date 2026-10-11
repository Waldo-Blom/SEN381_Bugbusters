const { requestsService } = require('../requests');
const { pageContext } = require('../../shared/views/pageContext');
const workflowService = require('./workflow.service');

exports.dashboard = async (req, res) => {
  res.render('workflow/views/staff/dashboard', {
    ...pageContext('staff'),
    title: 'Staff Dashboard',
    activeHref: '/staff/dashboard',
    pageTitle: 'Staff Dashboard',
    pageSubtitle: 'Requests assigned to your department',
    requests: await requestsService.list(),
  });
};

exports.assignRequest = async (req, res) => {
  const requestId = req.params.id;
  const staffUserId = req.session?.user?.id;

  try {
    await workflowService.assignToSelf(requestId, staffUserId);
    res.redirect(`/staff/requests/${requestId}`);
  } catch (error) {
    if (error instanceof workflowService.AssignmentAuthorizationError) {
      return res.status(403).send(error.message);
    }
    res.status(400).send(error.message);
  }
};
