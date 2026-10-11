const requesterNav = [
  { href: '/requester/submit', label: 'New Request' },
  { href: '/requester/my-requests', label: 'My Requests' },
  { href: '/requester/settings', label: 'Settings' },
];

const staffNav = [
  { href: '/staff/dashboard', label: 'Dashboard' },
  { href: '/staff/search', label: 'Search & Filter' },
];

const managementNav = [
  { href: '/manager/dashboard', label: 'Dashboard' },
  { href: '/manager/requests', label: 'All Requests' },
  { href: '/manager/reporting', label: 'Reporting & Audit' },
  { href: '/manager/users', label: 'User Management' },
];

const operatorNav = [
  { href: '/operator/submit', label: 'Log a Request' },
  { href: '/operator/requests', label: 'Logged Requests' },
];

module.exports = { requesterNav, staffNav, managementNav, operatorNav };
