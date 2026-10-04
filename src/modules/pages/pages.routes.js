const router = require('express').Router();
const pageController = require('./pages.controller');

router.get('/', pageController.landing);

module.exports = router;
