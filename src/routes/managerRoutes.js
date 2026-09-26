const router = require('express').Router();
const managerController = require('../controllers/managerController');
const {  } = require('../middleware/authMiddleware');

//   GET  /dashboard              FR-301
//   GET  /requests               FR-304 (analysis/filter)
//   GET  /requests/:id           FR-302 (audit view)
//   POST /requests/:id/assign    FR-303
//   POST /requests/:id/reassign  FR-303
//   POST /requests/:id/grant-contact   FR-305

module.exports = router;
