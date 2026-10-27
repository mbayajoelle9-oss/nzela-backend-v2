const axios = require('axios');
const Payment = require('../models/Payment');
const User = require('../models/User');
const {
  LIMITS, normalizePhone, phoneVariants, maskName, verifyWithFlexpay, settleTopup,
} = require('../utils/wallet');

const newOrderNumber = (prefix) =>
  `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;

const parseAmount = (value) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? n : NaN;
};

// ============================================================
// POST /api/payments/topup
// Recharger le portefeuille (Mobile Money ou carte) via FlexPay
// body : { amount, method: 'mobile_money' | 'card', phoneNumber? }
// ============================================================
const initTopup = async (req, res) => {
  try {
    const { method } = req.body;
    const amount = parseAmount(req.body.amount);

    if (!(amount >= LIMITS.minTopup && amount <= LIMITS.maxTopup)) {
      return res.status(400).json({
        message: `Montant invalide : entre ${LIMITS.minTopup.toLocaleString('fr-FR')} et ${LIMITS.maxTopup.toLocaleString('fr-FR')} CDF`,
      });
    }
    if (!['mobile_money', 'card'].includes(method)) {
      return res.status(400).json({ message: 'Choisissez Mobile Money ou carte bancaire' });
    }

    let phone = null;
    if (method === 'mobile_money') {
      phone = normalizePhone(req.body.phoneNumber);
      if (!phone) {
        return res.status(400).json({ message: 'Numéro Mobile Money invalide (ex. 0812345678)' });
      }
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });

    // On enregistre la recharge AVANT d'appeler FlexPay, pour que le webhook la retrouve
    const orderNumber = newOrderNumber('EKOWAL');
    const payment = await Payment.create({
      userId: req.userId,
      type: 'topup',
      amount,
      method,
      status: 'pending',
      phoneNumber: phone || undefined,
      orderNumber,
      provider: 'flexpay',
    });

    const common = {
      order_number: orderNumber,
      amount,
      currency: 'CDF',
      description: `Recharge portefeuille Ekomi ${orderNumber}`,
      callback_url: `${process.env.BACKEND_URL}/api/payments/callback`,
      webhook_url: `${process.env.BACKEND_URL}/api/payments/webhook`,
    };

    try {
      const headers = {
        Authorization: `Bearer ${process.env.FLEXPAY_BEARER_TOKEN}`,
        'Content-Type': 'application/json',
      };

      if (method === 'mobile_money') {
        const response = await axios.post(
          process.env.FLEXPAY_PAYMENT_URL,
          { ...common, phone },
          { headers, timeout: 20000 }
        );
        if (response.data?.transaction_id) {
          payment.transactionId = response.data.transaction_id;
          await payment.save();
        }
        return res.json({
          success: true,
          orderNumber,
          message: 'Demande envoyée : validez le paiement sur votre téléphone',
        });
      }

      const response = await axios.post(
        process.env.FLEXPAY_CARD_URL,
        { ...common, customer_email: user.email, customer_name: user.name },
        { headers, timeout: 20000 }
      );
      if (response.data?.transaction_id) {
        payment.transactionId = response.data.transaction_id;
        await payment.save();
      }
      return res.json({
        success: true,
        orderNumber,
        paymentUrl: response.data?.payment_url,
        message: 'Redirection vers la page de paiement sécurisé',
      });
    } catch (error) {
      await Payment.updateOne({ _id: payment._id }, { $set: { status: 'failed' } });
      console.error('Erreur FlexPay (recharge):', error.response?.data || error.message);
      return res.status(502).json({
        message: error.response?.data?.message || 'Le service de paiement est indisponible, réessayez',
      });
    }
  } catch (error) {
    console.error('Erreur recharge:', error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// GET /api/payments/topup/:orderNumber
// Suivi d'une recharge (l'app l'interroge toutes les quelques secondes)
// ============================================================
const checkTopup = async (req, res) => {
  try {
    const payment = await Payment.findOne({
      orderNumber: req.params.orderNumber, type: 'topup', userId: req.userId,
    });
    if (!payment) return res.status(404).json({ message: 'Recharge introuvable' });

    let current = payment;
    if (payment.status === 'pending') {
      const outcome = await verifyWithFlexpay(payment.orderNumber);
      if (outcome === 'success' || outcome === 'failed') {
        await settleTopup(payment.orderNumber, outcome);
        current = await Payment.findById(payment._id);
      }
    }

    const user = await User.findById(req.userId).select('walletBalance');
    res.json({
      success: true,
      status: current.status,
      amount: current.amount,
      balance: user?.walletBalance || 0,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// GET /api/payments/wallet
// Solde, points fidélité et historique (30 dernières opérations)
// ============================================================
const getWallet = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('walletBalance loyaltyPoints');
    if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });

    const transactions = await Payment.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .limit(30)
      .select('type amount currency method status counterpartName orderNumber createdAt')
      .lean();

    res.json({
      success: true,
      balance: user.walletBalance || 0,
      loyaltyPoints: user.loyaltyPoints || 0,
      currency: 'CDF',
      limits: LIMITS,
      transactions,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Limiteur simple : 10 recherches de destinataire par minute et par utilisateur
const lookups = new Map();
const lookupAllowed = (userId) => {
  const now = Date.now();
  const recent = (lookups.get(userId) || []).filter((t) => now - t < 60000);
  if (recent.length >= 10) { lookups.set(userId, recent); return false; }
  recent.push(now);
  lookups.set(userId, recent);
  return true;
};

const findRecipient = async (phone, senderId) => {
  const variants = phoneVariants(phone);
  if (!variants.length) return { error: 'Numéro invalide (ex. 0812345678)', status: 400 };
  const recipient = await User.findOne({ phone: { $in: variants }, isActive: { $ne: false } })
    .select('name phone');
  if (!recipient) return { error: 'Aucun compte Ekomi avec ce numéro', status: 404 };
  if (recipient._id.toString() === String(senderId)) {
    return { error: 'Vous ne pouvez pas vous envoyer de l\'argent', status: 400 };
  }
  return { recipient };
};

// ============================================================
// GET /api/payments/wallet/recipient?phone=...
// Vérifie le destinataire avant un transfert (nom abrégé uniquement)
// ============================================================
const lookupRecipient = async (req, res) => {
  try {
    if (!lookupAllowed(req.userId)) {
      return res.status(429).json({ message: 'Trop de recherches, réessayez dans une minute' });
    }
    const found = await findRecipient(req.query.phone, req.userId);
    if (found.error) return res.status(found.status).json({ message: found.error });
    res.json({ success: true, name: maskName(found.recipient.name) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// POST /api/payments/wallet/transfer
// body : { phone, amount } — débit atomique de l'expéditeur, puis crédit
// ============================================================
const transfer = async (req, res) => {
  try {
    const amount = parseAmount(req.body.amount);
    if (!(amount >= LIMITS.minTransfer && amount <= LIMITS.maxTransfer)) {
      return res.status(400).json({
        message: `Montant invalide : entre ${LIMITS.minTransfer.toLocaleString('fr-FR')} et ${LIMITS.maxTransfer.toLocaleString('fr-FR')} CDF`,
      });
    }

    const found = await findRecipient(req.body.phone, req.userId);
    if (found.error) return res.status(found.status).json({ message: found.error });
    const { recipient } = found;

    const sender = await User.findById(req.userId).select('name');
    if (!sender) return res.status(404).json({ message: 'Utilisateur introuvable' });

    // 1) Débit atomique : refusé si le solde ne suffit pas (impossible de passer sous 0)
    const debited = await User.findOneAndUpdate(
      { _id: req.userId, walletBalance: { $gte: amount } },
      { $inc: { walletBalance: -amount } },
      { new: true }
    );
    if (!debited) return res.status(400).json({ message: 'Solde insuffisant' });

    // 2) Crédit du destinataire ; en cas d'échec on rembourse l'expéditeur
    try {
      await User.findByIdAndUpdate(recipient._id, { $inc: { walletBalance: amount } });
    } catch (error) {
      await User.findByIdAndUpdate(req.userId, { $inc: { walletBalance: amount } });
      console.error('Transfert annulé (crédit impossible) :', error);
      return res.status(500).json({ message: 'Transfert impossible, votre solde n\'a pas changé' });
    }

    // 3) Historique des deux côtés
    const orderNumber = newOrderNumber('EKOTRF');
    await Payment.create([
      {
        userId: req.userId, type: 'transfer_out', amount, method: 'wallet', status: 'completed',
        orderNumber, credited: true, counterpartId: recipient._id, counterpartName: maskName(recipient.name),
        provider: 'ekomi',
      },
      {
        userId: recipient._id, type: 'transfer_in', amount, method: 'wallet', status: 'completed',
        orderNumber, credited: true, counterpartId: req.userId, counterpartName: maskName(sender.name),
        provider: 'ekomi',
      },
    ]);

    res.json({
      success: true,
      balance: debited.walletBalance,
      message: `${amount.toLocaleString('fr-FR')} CDF envoyés à ${maskName(recipient.name)}`,
    });
  } catch (error) {
    console.error('Erreur transfert:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = { initTopup, checkTopup, getWallet, lookupRecipient, transfer };
