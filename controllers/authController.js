const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const fetch = require('node-fetch');

const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '120d' });
};

// ============================================================
// INSCRIPTION / CONNEXION CLASSIQUE
// ============================================================

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
      role: role || 'passenger',
    });

    res.status(201).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        loyaltyPoints: user.loyaltyPoints,
      },
      token: generateToken(user._id, user.role),
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
        loyaltyPoints: user.loyaltyPoints,
      },
      token: generateToken(user._id, user.role),
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

// ============================================================
// GOOGLE LOGIN — validation multi-audience (Web + Android + iOS)
// ============================================================

// ✅ Le client OAuth2 est initialisé avec le Web Client ID
// (c'est lui qui reçoit et vérifie tous les id_tokens)
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ✅ Liste des audiences acceptées : Google signe le token avec le Client ID
// de la plateforme qui a demandé la connexion. Le backend doit accepter
// tous les Client IDs de l'écosystème (Web + Android + iOS).
const googleAudiences = [
  process.env.GOOGLE_CLIENT_ID,           // Web (backend, dev)
  process.env.GOOGLE_ANDROID_CLIENT_ID,   // APK Android
  process.env.GOOGLE_IOS_CLIENT_ID,       // App iOS (plus tard)
].filter(Boolean); // retire les valeurs undefined si un Client ID n'est pas encore configuré

const googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ message: 'idToken manquant' });
    }

    if (googleAudiences.length === 0) {
      console.error('Aucun Google Client ID configuré côté serveur');
      return res.status(500).json({ message: 'Configuration Google manquante côté serveur' });
    }

    // ✅ Vérifie que le token est signé par Google ET destiné à l'un de NOS Client IDs
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: googleAudiences,
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId } = payload;

    if (!email) {
      return res.status(400).json({ message: 'Email non fourni par Google' });
    }

    let user = await User.findOne({ $or: [{ email }, { googleId }] });

    if (!user) {
      user = await User.create({
        name: name || email.split('@')[0],
        email,
        phone: `google_${googleId.slice(-12)}`, // suffixe plus long pour éviter les collisions
        password: await bcrypt.hash(googleId + process.env.JWT_SECRET, 10),
        googleId,
        avatar: picture,
        role: 'passenger',
      });
    } else if (!user.googleId) {
      // Cas : le user existait déjà via email/password, on lie son compte Google
      user.googleId = googleId;
      if (picture && !user.avatar) user.avatar = picture;
      await user.save();
    }

    const token = generateToken(user._id, user.role);

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        loyaltyPoints: user.loyaltyPoints,
      },
      token,
    });
  } catch (error) {
    console.error('Erreur Google login:', error.message);
    // Message plus précis pour le debug côté client
    if (error.message && error.message.includes('audience')) {
      return res.status(401).json({
        message: 'Token Google invalide (audience non reconnue). Vérifiez la configuration.',
      });
    }
    res.status(500).json({ message: 'Erreur authentification Google' });
  }
};

// ============================================================
// FACEBOOK LOGIN
// ============================================================

const facebookLogin = async (req, res) => {
  try {
    const { accessToken } = req.body;
    if (!accessToken) {
      return res.status(400).json({ message: 'accessToken manquant' });
    }

    const fbResponse = await fetch(
      `https://graph.facebook.com/me?access_token=${accessToken}&fields=id,name,email`
    );
    const data = await fbResponse.json();

    if (!data.id) {
      throw new Error('Token Facebook invalide');
    }

    const { id: facebookId, name, email } = data;

    let user = await User.findOne({ $or: [{ email }, { facebookId }] });

    if (!user) {
      user = await User.create({
        name: name || email?.split('@')[0] || 'Utilisateur Facebook',
        email: email || `${facebookId}@facebook.com`,
        phone: `fb_${facebookId.slice(-12)}`,
        password: await bcrypt.hash(facebookId + process.env.JWT_SECRET, 10),
        facebookId,
        role: 'passenger',
      });
    } else if (!user.facebookId) {
      user.facebookId = facebookId;
      await user.save();
    }

    const token = generateToken(user._id, user.role);

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        loyaltyPoints: user.loyaltyPoints,
      },
      token,
    });
  } catch (error) {
    console.error('Erreur Facebook login:', error.message);
    res.status(500).json({ message: 'Erreur authentification Facebook' });
  }
};

// ============================================================
// EXPO PUSH TOKEN
// ============================================================
// Enregistre le token Expo Push pour l'utilisateur connecté
// Appelé par le mobile au démarrage / après login
const savePushToken = async (req, res) => {
  try {
    const { expoPushToken, platform } = req.body;
    if (!expoPushToken) {
      return res.status(400).json({ message: 'Token manquant' });
    }
    await User.findByIdAndUpdate(req.userId, {
      expoPushToken,
      pushTokenPlatform: platform,
      pushTokenUpdatedAt: new Date(),
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  register,
  login,
  getProfile,
  googleLogin,
  facebookLogin,
  savePushToken,
};