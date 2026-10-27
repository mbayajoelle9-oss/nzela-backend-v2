const PricingConfig = require('../models/PricingConfig');

// ============================================================
// TARIFICATION PARAMÉTRABLE
// Les valeurs ci-dessous sont les valeurs PAR DÉFAUT, utilisées tant que
// l'admin n'a rien enregistré en base. `null` = « tarif à définir » :
// l'app affiche « Tarif à définir » et refuse la réservation.
// Les prix sont en USD ; usdToCdf sert à afficher/enregistrer l'équivalent CDF.
// ============================================================
const DEFAULT_PRICING = {
  usdToCdf: 2800, // ⚠️ à vérifier / ajuster (taux de change CDF pour 1 USD)

  // Transport de biens : facturé à l'heure, par catégorie de véhicule
  goods: {
    standard:      { label: 'Standard',      vehicles: 'IST',            perHourUSD: null },
    intermediaire: { label: 'Intermédiaire', vehicles: 'Pick-up',        perHourUSD: null },
    full:          { label: 'Full',          vehicles: 'Benne, camion',  perHourUSD: null },
  },

  // Location de véhicules : facturée à l'heure, tarif jour / nuit
  rental: {
    dayStartHour: 5,    // jour : de 05h00 …
    nightStartHour: 18, // … à 17h59 ; nuit : de 18h00 à 04h59
    vehicles: {
      ist:    { label: 'IST',           dayPerHourUSD: 8,    nightPerHourUSD: 16 },
      pickup: { label: 'Pick-up',       dayPerHourUSD: null, nightPerHourUSD: null },
      full:   { label: 'Benne / camion', dayPerHourUSD: null, nightPerHourUSD: null },
    },
  },

  // Forfaits événementiels à prix fixe (indépendants de la durée)
  events: {
    mariage:      { label: 'Mariage',      priceUSD: null },
    anniversaire: { label: 'Anniversaire', priceUSD: null },
  },
};

const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

function deepMerge(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override === undefined ? base : override;
  }
  const out = { ...base };
  for (const key of Object.keys(override)) {
    out[key] = key in base ? deepMerge(base[key], override[key]) : override[key];
  }
  return out;
}

// Chaque valeur non textuelle doit être null ou un nombre ≥ 0
function validateNumbers(node, path = '') {
  if (isPlainObject(node)) {
    for (const [k, v] of Object.entries(node)) {
      const err = validateNumbers(v, path ? `${path}.${k}` : k);
      if (err) return err;
    }
    return null;
  }
  if (typeof node === 'string' || node === null) return null;
  if (typeof node !== 'number' || !Number.isFinite(node) || node < 0) {
    return `Valeur invalide pour « ${path} » (nombre ≥ 0 ou null attendu)`;
  }
  if (path === 'usdToCdf' && node <= 0) return 'usdToCdf doit être supérieur à 0';
  return null;
}

async function getPricing() {
  const doc = await PricingConfig.findOne({ key: 'default' }).lean();
  return deepMerge(DEFAULT_PRICING, doc?.data || {});
}

async function savePricing(partial) {
  const current = await getPricing();
  const merged = deepMerge(current, partial);
  const err = validateNumbers(merged);
  if (err) return { error: err };
  await PricingConfig.findOneAndUpdate(
    { key: 'default' },
    { key: 'default', data: merged },
    { upsert: true, new: true }
  );
  return { pricing: merged };
}

// Prix d'une commande de transport de biens (USD) = heures × tarif horaire
function goodsPriceUSD(pricing, category, hours) {
  const rate = pricing.goods?.[category]?.perHourUSD;
  const h = Math.ceil(Number(hours));
  if (rate == null || !Number.isFinite(h) || h < 1) return null;
  return +(rate * h).toFixed(2);
}

module.exports = { DEFAULT_PRICING, getPricing, savePricing, goodsPriceUSD, deepMerge };
