const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  createSuggestion,
  getMySuggestions,
  listSuggestions,
  updateSuggestion,
  getStats,
} = require('../controllers/suggestionController');

// Middleware "optionnel" — accepte un user connecté OU anonyme
// Si un token est fourni, req.userId est set. Sinon, on continue quand même.
const optionalAuth = (req, res, next) => {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    return protect(req, res, next);
  }
  next();
};

// Public / semi-public
router.post('/', optionalAuth, createSuggestion);

// Client connecté
router.get('/mine', protect, getMySuggestions);

// Admin uniquement (protect + vérif du rôle dans le contrôleur)
router.get('/', protect, listSuggestions);
router.get('/stats', protect, getStats);
router.patch('/:id', protect, updateSuggestion);

module.exports = router;
