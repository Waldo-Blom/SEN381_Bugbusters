const { requestsService } = require('../requests');
const { pageContext } = require('../../shared/views/pageContext');

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
