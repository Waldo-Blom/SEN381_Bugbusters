const router = require('express').Router();
const requesterController = require('../controllers/requesterController');
const {  } = require('../middleware/authMiddleware');

//   GET  /dashboard                FR-103  (history)
//   GET  /track                    FR-102  (lookup form)
//   POST /track                    FR-102  (lookup submit)
//   GET  /requests/new             FR-101
//   POST /requests                 FR-101
//   GET  /requests/:id             FR-102  (status detail)
//   POST /requests/:id/images      FR-106

module.exports = router;