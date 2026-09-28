const router = require('express').Router();
const pageController = require('../controllers/pageController');

router.get('/', pageController.landing);

module.exports = router;