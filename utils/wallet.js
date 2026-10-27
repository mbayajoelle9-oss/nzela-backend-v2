const axios = require('axios');
const Payment = require('../models/Payment');
const User = require('../models/User');

// ============================================================
// PORTEFEUILLE — utilitaires partagés (recharge, transferts)
// Montants en CDF, entiers.
// ============================================================

const LIMITS = {
  minTopup: Number(process.env.WALLET_MIN_TOPUP) || 1000,
  maxTopup: Number(process.env.WALLET_MAX_TOPUP) || 5000000,
  minTransfer: Number(process.env.WALLET_MIN_TRANSFER) || 500,
  maxTransfer: Number(process.env.WALLET_MAX_TRANSFER) || 1000000,
};

// 0812345678 / +243812345678 / 243 81 234 56 78 → "243812345678" (null si invalide)
function normalizePhone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('243')) return d;
  if (d.length === 10 && d.startsWith('0')) return `243${d.slice(1)}`;
  if (d.length === 9) return `243${d}`;
  return null;
}

// Formes sous lesquelles un numéro peut être stocké dans User.phone
function phoneVariants(raw) {
  const n = normalizePhone(raw);
  if (!n) return [];
  const l9 = n.slice(3);
  return [`0${l9}`, `243${l9}`, `+243${l9}`, l9];
}

// « Gad Nsimba » → « Gad N. » (on ne révèle pas le nom complet lors d'une recherche)
function maskName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Utilisateur Ekomi';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

// Transforme la réponse de FlexPay en success | failed | pending | unknown
function normalizeFlexpayStatus(data) {
  const raw = String(data?.transaction?.status ?? data?.status ?? '').toLowerCase();
  if (['success', 'successful', 'completed', 'paid', '0'].includes(raw)) return 'success';
  if (['failed', 'cancelled', 'canceled', 'error', 'refused', '1'].includes(raw)) return 'failed';
  if (['pending', 'processing', '2'].includes(raw)) return 'pending';
  return 'unknown';
}

// Interroge FlexPay côté serveur : on ne fait JAMAIS confiance à ce que le webhook affirme
async function verifyWithFlexpay(orderNumber) {
  try {
    const response = await axios.get(`${process.env.FLEXPAY_CHECK_URL}/${orderNumber}`, {
      headers: { Authorization: `Bearer ${process.env.FLEXPAY_BEARER_TOKEN}` },
      timeout: 15000,
    });
    const status = normalizeFlexpayStatus(response.data);
    if (status === 'unknown') {
      console.warn('[wallet] Réponse FlexPay non reconnue pour', orderNumber, JSON.stringify(response.data));
    }
    return status;
  } catch (error) {
    console.error('[wallet] Vérification FlexPay impossible :', error.response?.data || error.message);
    return 'unknown';
  }
}

/**
 * Applique le résultat d'une recharge. Idempotent : le solde n'est crédité
 * qu'une seule fois, même si FlexPay renvoie la notification plusieurs fois.
 * Renvoie true si CET appel a crédité le solde.
 */
async function settleTopup(orderNumber, outcome) {
  if (outcome === 'success') {
    // Le drapeau passe à true de façon atomique : un seul appel gagne
    const payment = await Payment.findOneAndUpdate(
      { orderNumber, type: 'topup', credited: false },
      { $set: { credited: true, status: 'completed' } },
      { new: true }
    );
    if (!payment) return false;
    try {
      await User.findByIdAndUpdate(payment.userId, { $inc: { walletBalance: payment.amount } });
    } catch (error) {
      // Le crédit a échoué : on rouvre la recharge pour qu'un prochain contrôle réessaie
      await Payment.updateOne({ _id: payment._id }, { $set: { credited: false, status: 'pending' } });
      throw error;
    }
    return true;
  }

  if (outcome === 'failed') {
    await Payment.updateOne(
      { orderNumber, type: 'topup', credited: false, status: 'pending' },
      { $set: { status: 'failed' } }
    );
  }
  return false;
}

module.exports = {
  LIMITS,
  normalizePhone,
  phoneVariants,
  maskName,
  normalizeFlexpayStatus,
  verifyWithFlexpay,
  settleTopup,
};
