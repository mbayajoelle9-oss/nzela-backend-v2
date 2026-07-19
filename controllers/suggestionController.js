const Suggestion = require('../models/Suggestion');

// ============================================================
// POST /api/suggestions
// Créer une nouvelle suggestion (client connecté OU anonyme)
// ============================================================
const createSuggestion = async (req, res) => {
  try {
    const { category, rating, message, platform, appVersion } = req.body;

    // Validation
    if (!category) {
      return res.status(400).json({ message: 'Catégorie requise' });
    }
    if (!message || message.trim().length < 10) {
      return res.status(400).json({
        message: 'Le message doit contenir au moins 10 caractères',
      });
    }
    if (message.length > 500) {
      return res.status(400).json({
        message: 'Le message ne peut pas dépasser 500 caractères',
      });
    }

    const suggestion = await Suggestion.create({
      user: req.userId || null,
      category,
      rating: rating || null,
      message: message.trim(),
      device: {
        platform: platform || null,
        appVersion: appVersion || null,
      },
    });

    res.status(201).json({
      success: true,
      id: suggestion._id,
      message: 'Merci pour votre suggestion !',
    });
  } catch (error) {
    console.error('Erreur création suggestion:', error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// GET /api/suggestions/mine
// Voir mes suggestions (client connecté)
// ============================================================
const getMySuggestions = async (req, res) => {
  try {
    const suggestions = await Suggestion.find({ user: req.userId })
      .sort({ createdAt: -1 })
      .select('-adminNote -device');

    res.json({ success: true, suggestions });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// GET /api/suggestions (admin uniquement)
// Lister toutes les suggestions avec filtres
// ============================================================
const listSuggestions = async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Accès réservé aux administrateurs' });
    }

    const { status, category, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [suggestions, total] = await Promise.all([
      Suggestion.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('user', 'name email phone'),
      Suggestion.countDocuments(filter),
    ]);

    res.json({
      success: true,
      suggestions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// PATCH /api/suggestions/:id (admin uniquement)
// Mettre à jour le statut / ajouter une note admin
// ============================================================
const updateSuggestion = async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Accès réservé aux administrateurs' });
    }

    const { status, adminNote } = req.body;
    const updates = {};
    if (status) updates.status = status;
    if (adminNote !== undefined) updates.adminNote = adminNote;

    const suggestion = await Suggestion.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true }
    );

    if (!suggestion) {
      return res.status(404).json({ message: 'Suggestion non trouvée' });
    }

    res.json({ success: true, suggestion });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// GET /api/suggestions/stats (admin uniquement)
// Stats pour le dashboard admin
// ============================================================
const getStats = async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Accès réservé aux administrateurs' });
    }

    const [byCategory, byStatus, avgRating, total] = await Promise.all([
      Suggestion.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]),
      Suggestion.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Suggestion.aggregate([
        { $match: { rating: { $ne: null } } },
        { $group: { _id: null, avg: { $avg: '$rating' } } },
      ]),
      Suggestion.countDocuments(),
    ]);

    res.json({
      success: true,
      total,
      averageRating: avgRating[0]?.avg?.toFixed(2) || null,
      byCategory,
      byStatus,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createSuggestion,
  getMySuggestions,
  listSuggestions,
  updateSuggestion,
  getStats,
};
