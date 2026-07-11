const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const fetch = require('node-fetch');

const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '120d' });
};

// ==== INSCRIPTION / CONNEXION CLASSIQUE ====
const register = async (req, res) => {
  try {
    const { name, phone, email, password, role } = req.body;
    const userExists = await User.findOne({ $or: [{ email }, { phone }] });
    if (userExists) {
      return res.status(400).json({ message: 'Utilisateur déjà existant' });
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const user = await User.create({
      name,
      phone,
      email,
      password: hashedPassword,
      role: role || 'passenger'
    });
    res.status(201).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        loyaltyPoints: user.loyaltyPoints
      },
      token: generateToken(user._id, user.role)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }
    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        loyaltyPoints: user.loyaltyPoints
      },
      token: generateToken(user._id, user.role)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==== GOOGLE LOGIN ====
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ message: 'idToken manquant' });

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId } = payload;

    let user = await User.findOne({ $or: [{ email }, { googleId }] });
    if (!user) {
      user = await User.create({
        name: name || email.split('@')[0],
        email,
        phone: `google_${googleId.slice(-8)}`,
        password: await bcrypt.hash(googleId + process.env.JWT_SECRET, 10),
        googleId,
        role: 'passenger',
      });
    }

    const token = generateToken(user._id, user.role);
    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        loyaltyPoints: user.loyaltyPoints
      },
      token,
    });
  } catch (error) {
    console.error('Erreur Google login:', error);
    res.status(500).json({ message: 'Erreur authentification Google' });
  }
};

// ==== FACEBOOK LOGIN ====
const facebookLogin = async (req, res) => {
  try {
    const { accessToken } = req.body;
    if (!accessToken) return res.status(400).json({ message: 'accessToken manquant' });

    const fbResponse = await fetch(`https://graph.facebook.com/me?access_token=${accessToken}&fields=id,name,email`);
    const data = await fbResponse.json();
    if (!data.id) throw new Error('Token Facebook invalide');

    const { id: facebookId, name, email } = data;

    let user = await User.findOne({ $or: [{ email }, { facebookId }] });
    if (!user) {
      user = await User.create({
        name: name || email?.split('@')[0] || 'Utilisateur Facebook',
        email: email || `${facebookId}@facebook.com`,
        phone: `fb_${facebookId.slice(-8)}`,
        password: await bcrypt.hash(facebookId + process.env.JWT_SECRET, 10),
        facebookId,
        role: 'passenger',
      });
    }

    const token = generateToken(user._id, user.role);
    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        loyaltyPoints: user.loyaltyPoints
      },
      token,
    });
  } catch (error) {
    console.error('Erreur Facebook login:', error);
    res.status(500).json({ message: 'Erreur authentification Facebook' });
  }
};

module.exports = {
  register,
  login,
  getProfile,
  googleLogin,
  facebookLogin
};