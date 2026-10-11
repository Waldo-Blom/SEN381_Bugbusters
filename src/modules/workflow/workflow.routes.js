const router = require('express').Router();
const c = require('./workflow.controller');

const requireStaff = (req, res, next) => {
  const user = req.session?.user;
  if (!user) {
    return res.status(401).send('Please sign in to continue.');
  }
  if (user.role !== 'staff' || !user.email) {
    return res.status(403).send('Only staff can access this page.');
  }
  next();
};

router.get('/staff/dashboard', requireStaff, c.dashboard);
router.post('/staff/requests/:id/assign', requireStaff, c.assignRequest);

module.exports = router;
