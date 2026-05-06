const express = require('express');
const router = express.Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');

router.get('/auth/google', passport.authenticate('google', { scope: ['profile','email'] }));

router.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/user/login' }),
  (req, res) => {
    // create JWT like your local login flow
    const token = jwt.sign({
      userId: req.user._id,
      email: req.user.email,
      username: req.user.username
    }, process.env.JWT_SECRET);

    res.cookie('token', token);
    res.redirect('/home'); // or process.env.CLIENT_URL
  });

module.exports = router;