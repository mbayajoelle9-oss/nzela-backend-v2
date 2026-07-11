const express = require('express');
const router = express.Router();
const passport = require('passport');
const { register, login, getProfile, googleLogin, facebookLogin } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

// Routes classiques
router.post('/register', register);
router.post('/login', login);
router.get('/profile', protect, getProfile);

// Routes Google / Facebook (via token ID)
router.post('/google', googleLogin);
router.post('/facebook', facebookLogin);

// Routes OAuth avec redirection (passport)
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', passport.authenticate('google', { session: false, failureRedirect: '/login' }), (req, res) => {
  const { token, user } = req.user;
  res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}&user=${encodeURIComponent(JSON.stringify(user))}`);
});

router.get('/facebook', passport.authenticate('facebook', { scope: ['email'] }));
router.get('/facebook/callback', passport.authenticate('facebook', { session: false, failureRedirect: '/login' }), (req, res) => {
  const { token, user } = req.user;
  res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}&user=${encodeURIComponent(JSON.stringify(user))}`);
});

module.exports = router;