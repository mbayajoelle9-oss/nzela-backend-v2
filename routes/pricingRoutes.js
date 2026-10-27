const express = require('express');
const router = express.Router();
const { protect, requireAdmin } = require('../middleware/authMiddleware');
const { getPricing, savePricing } = require('../utils/pricing');

// GET /api/pricing — tarifs actuels (tout utilisateur connecté : l'app les affiche)
router.get('/', protect, async (req, res) => {
  try {
    res.json({ success: true, pricing: await getPricing() });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// PUT /api/pricing — modification des tarifs (admin uniquement).
// Corps = objet partiel, fusionné avec la config actuelle. Exemple :
//   { "rental": { "vehicles": { "pickup": { "dayPerHourUSD": 12, "nightPerHourUSD": 24 } } } }
router.put('/', protect, requireAdmin, async (req, res) => {
  try {
    const result = await savePricing(req.body || {});
    if (result.error) return res.status(400).json({ message: result.error });
    res.json({ success: true, pricing: result.pricing });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
