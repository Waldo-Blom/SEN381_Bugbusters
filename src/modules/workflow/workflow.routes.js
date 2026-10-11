const router = require('express').Router();
const c = require('./workflow.controller');

router.get(
  '/staff/dashboard',
  (req, res, next) => {
    const user = req.session?.user;
    if (!user) {
      return res.status(401).send('Please sign in to continue.');
    }
    if (user.role !== 'staff' || !user.email) {
      return res.status(403).send('Only staff can access this page.');
    }
    next();
  },
  c.dashboard
);

module.exports = router;
