const { requestsService } = require('../requests');
const { pageContext } = require('../../shared/views/pageContext');
const workflowService = require('./workflow.service');
const { getAuthenticatedUserId } = require('../auth/auth.middleware');

exports.dashboard = async (req, res) => {
  const staffUserId = getAuthenticatedUserId(req);
  const usersService = require('../users/users.service');
  const staffDept = await usersService.getStaffDepartment(staffUserId);
  const departmentId = staffDept?.departmentId || null;

  const filters = {
    q: req.query.q || '',
    status: req.query.status || 'All',
    category: req.query.category || 'All',
    priority: req.query.priority || 'All',
    sort: req.query.sort || 'date',
    tab: req.query.tab || 'all',
  };

  const requests = await requestsService.searchStaffRequests({
    staffUserId,
    departmentId,
    ...filters,
  });

  const categories = await requestsService.listCategoriesByDepartment(departmentId);

  res.render('workflow/views/staff/dashboard', {
    ...pageContext('staff', req),
    title: 'Staff Dashboard',
    activeHref: '/staff/dashboard',
    pageTitle: 'Staff Dashboard',
    pageSubtitle: staffDept
      ? `Requests assigned to ${staffDept.departmentName} Department`
      : 'Requests assigned to your department',
    requests,
    filters,
    categories,
    departmentName: staffDept?.departmentName || '',
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