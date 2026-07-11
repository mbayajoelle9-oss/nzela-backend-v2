const User = require('../models/User');
const jwt = require('jsonwebtoken');
const generateToken = (id, role) => jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '30d' });

// Callback après vérification par Google ou Facebook
const socialAuthCallback = async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails?.[0]?.value;
    // Vérifier si utilisateur existe déjà via l'email ou l'ID unique du fournisseur
    let user = await User.findOne({ $or: [{ email }, { [`${profile.provider}Id`]: profile.id }] });

    if (!user) {
      // Créer nouvel utilisateur
      user = new User({
        name: profile.displayName,
        email: email,
        phone: '',
        password: 'oauth_' + Math.random().toString(36).substring(7),
        role: 'passenger',
        loyaltyPoints: 0
      });
      user[`${profile.provider}Id`] = profile.id;
      await user.save();
    }
    // Générer un token JWT pour l'utilisateur
    const token = generateToken(user._id, user.role);
    return done(null, { user, token });
  } catch (error) {
    return done(error, null);
  }
};
module.exports = socialAuthCallback;
