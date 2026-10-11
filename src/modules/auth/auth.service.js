const HOME_BY_ROLE = {
  requester: '/requester/my-requests',
  staff: '/staff/dashboard',
  management: '/manager/dashboard',
  operator: '/operator/submit',
};

// TODO: Replace these demo sessions with authenticated users from the database.
exports.mockLogin = (role) => {
  const key = HOME_BY_ROLE[role] ? role : 'requester';
  const label = key === 'management' ? 'Manager' : key[0].toUpperCase() + key.slice(1);
  return {
    user: {
      id: `demo-${key}`,
      name: `Demo ${label}`,
      email: `${key}@demo.invalid`,
      role: key,
      avatarInitials: `D${label[0]}`,
    },
    redirectTo: HOME_BY_ROLE[key],
  };
};
