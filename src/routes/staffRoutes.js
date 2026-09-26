const router = require('express').Router();
const staffController = require('../controllers/staffController');
const {  } = require('../middleware/authMiddleware');

//   GET  /list_of_requests (use a queue maybe??)       FR-203, FR-207 (dept-filtered)
//   GET  /requests/:id           FR-205
//   POST /requests/:id/claim     FR-201
//   PATCH /requests/:id/status   FR-202
//   POST /requests/:id/resolution FR-204
//   POST /requests/:id/close     FR-206
//   POST /requests/:id/contact-request   (staff asks for contact access — supports FR-305)

module.exports = router;