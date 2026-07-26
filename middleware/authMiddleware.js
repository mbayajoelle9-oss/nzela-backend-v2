const jwt = require('jsonwebtoken');

/**
 * Middleware "protect" — vérifie le token JWT et attache req.userId + req.userRole
 * Corrigé :
 *  - split(' ') avec un ESPACE (l'ancien split('') coupait par caractère)
 *  - return après chaque res.status pour éviter les "Cannot set headers after they are sent"
 */
const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Non autorisé, pas de token' });
  }

  const token = authHeader.split(' ')[1]; // ✅ ESPACE, pas chaîne vide

  if (!token) {
    return res.status(401).json({ message: 'Non autorisé, pas de token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    req.userRole = decoded.role;
    return next();
  } catch (error) {
    // Différencie expiration vs token invalide (utile côté client)
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Session expirée, reconnectez-vous' });
    }
    return res.status(401).json({ message: 'Non autorisé, token invalide' });
  }
};

/**
 * Middleware "requireAdmin" — à utiliser APRÈS protect
 * Refuse l'accès si l'utilisateur n'est pas admin
 */
const requireAdmin = (req, res, next) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ message: 'Accès réservé aux administrateurs' });
  }
  next();
};

module.exports = { protect, requireAdmin };
