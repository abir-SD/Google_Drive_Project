const express = require('express');
const router = express.Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');

router.get('/auth/google', passport.authenticate('google', { scope: ['profile','email'] }));

router.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/user/login' }),
  (req, res) => {
    try {
      // Validate that user exists
      if (!req.user || !req.user._id) {
        console.error('❌ Google auth failed: No user object from Passport');
        return res.redirect('/user/login?error=auth_failed');
      }

      // create JWT like your local login flow
      const token = jwt.sign({
        userId: req.user._id,
        email: req.user.email,
        username: req.user.username
      }, process.env.JWT_SECRET, { expiresIn: '7d' });

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });
      
      console.log('✅ Google auth successful for user:', req.user.email);
      res.redirect('/home'); // or process.env.CLIENT_URL
    } catch (err) {
      console.error('❌ Error in Google callback:', err.message);
      console.error('Stack:', err.stack);
      res.redirect('/user/login?error=auth_error');
    }
  });

module.exports = router;