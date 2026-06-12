const jwt = require('jsonwebtoken');

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split('')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = decoded.id;
      req.userRole = decoded.role;
      next();
    } catch (error) {
      res.status(401).json({ message: 'Non autorisé, token invalide' });
    }
  }

  if (!token) {
    res.status(401).json({ message: 'Non autorisé, pas de token' });
  }
};

module.exports = { protect };
