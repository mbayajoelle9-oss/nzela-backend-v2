const mongoose = require('mongoose');

// Un seul document (key = 'default') qui contient toute la tarification
// paramétrable. Voir utils/pricing.js pour la structure et les valeurs par défaut.
const pricingConfigSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PricingConfig', pricingConfigSchema);
