const Payment = require('../models/Payment');
const Ride = require('../models/Ride');
const User = require('../models/User');
const axios = require('axios');

const FLEXPAY_PAYMENT_URL = process.env.FLEXPAY_PAYMENT_URL;
const FLEXPAY_CARD_URL = process.env.FLEXPAY_CARD_URL;
const FLEXPAY_CHECK_URL = process.env.FLEXPAY_CHECK_URL;
const FLEXPAY_BEARER_TOKEN = process.env.FLEXPAY_BEARER_TOKEN;

// @desc    Initialiser un paiement Mobile Money avec FlexPay
// @route   POST /api/payments/init
const initPayment = async (req, res) => {
  try {
    const { rideId, method, phoneNumber } = req.body;

    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(404).json({ message: 'Course non trouvée' });
    }

    const user = await User.findById(req.userId);

    // Paiement en espèces
    if (method === 'cash') {
      const payment = await Payment.create({
        rideId,
        userId: req.userId,
        amount: ride.price,
        method: 'cash',
        status: 'pending'
      });
      return res.json({ 
        success: true, 
        payment, 
        message: 'Paiement en espèces à la livraison'
      });
    }

    // Paiement Mobile Money
    if (method === 'mobile_money') {
      const orderNumber = `NZELA${Date.now()}${Math.floor(Math.random() * 1000)}`;

      const paymentData = {
        order_number: orderNumber,
        amount: ride.price,
        currency: 'CDF',
        phone: phoneNumber,
        description: `Paiement course N'ZELA ${rideId}`,
        callback_url: `${process.env.BACKEND_URL}/api/payments/callback`,
        webhook_url: `${process.env.BACKEND_URL}/api/payments/webhook`
      };

      const response = await axios.post(FLEXPAY_PAYMENT_URL, paymentData, {
        headers: { 
'Authorization': `Bearer ${FLEXPAY_BEARER_TOKEN}`,
'Content-Type': 'application/json'
        }
      });

      const payment = await Payment.create({
        rideId,
        userId: req.userId,
        amount: ride.price,
        method: 'mobile_money',
        status: 'pending',
        phoneNumber: phoneNumber,
        transactionId: response.data.transaction_id || orderNumber,
        provider: 'flexpay',
        orderNumber: orderNumber
      });

      return res.json({ 
        success: true, 
        payment,
        transactionId: response.data.transaction_id,
        message: 'Paiement initié, vérifiez votre téléphone Mobile Money'
      });
    }

    // Paiement par Carte Bancaire
    if (method === 'card') {
      const orderNumber = `NZELA${Date.now()}${Math.floor(Math.random() * 1000)}`;

      const cardData = {
        order_number: orderNumber,
        amount: ride.price,
        currency: 'CDF',
        description: `Paiement course N'ZELA ${rideId}`,
        callback_url: `${process.env.BACKEND_URL}/api/payments/callback`,
        customer_email: user.email,
        customer_name: user.name
      };

      const response = await axios.post(FLEXPAY_CARD_URL, cardData, {
        headers: { 
'Authorization': `Bearer ${FLEXPAY_BEARER_TOKEN}`,
'Content-Type': 'application/json'
        }
      });

      const payment = await Payment.create({
        rideId,
        userId: req.userId,
        amount: ride.price,
        method: 'card',
        status: 'pending',
        transactionId: response.data.transaction_id || orderNumber,
        provider: 'flexpay',
        orderNumber: orderNumber
      });

      return res.json({ 
        success: true, 
        payment,
        paymentUrl: response.data.payment_url,
        message: 'Redirection vers la page de paiement sécurisé'
      });
    }

    res.status(400).json({ message: 'Méthode de paiement non supportée' });
  } catch (error) {
    console.error('Erreur FlexPay:', error.response?.data || error.message);
    res.status(500).json({ 
      message: 'Erreur initiation paiement', 
      error: error.response?.data?.message || error.message 
    });
  }
};

// @desc    Vérifier le statut d'une transaction
// @route   GET /api/payments/check/:orderNumber
const checkPaymentStatus = async (req, res) => {
  try {
    const { orderNumber } = req.params;

    const response = await axios.get(`${FLEXPAY_CHECK_URL}/${orderNumber}`, {
      headers: { 'Authorization': `Bearer ${FLEXPAY_BEARER_TOKEN}` }
    });

    const payment = await Payment.findOne({ orderNumber });
    if (payment && response.data.status === 'success') {
      payment.status = 'completed';
      await payment.save();
      await Ride.findByIdAndUpdate(payment.rideId, { paymentStatus: 'paid' });
      await User.findByIdAndUpdate(payment.userId, { $inc: { loyaltyPoints: 5 } });
    }

    res.json({ success: true, status: response.data.status, payment });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Callback FlexPay (retour après paiement)
// @route   POST /api/payments/callback
const paymentCallback = async (req, res) => {
  try {
    const { order_number, status, transaction_id, amount, phone } = req.body;

    const payment = await Payment.findOne({ orderNumber: order_number });
    if (!payment) {
      return res.status(404).json({ message: 'Paiement non trouvé' });
    }

    if (status === 'success' || status === 'successful') {
      payment.status = 'completed';
      payment.transactionId = transaction_id;
      await payment.save();

      await Ride.findByIdAndUpdate(payment.rideId, { paymentStatus: 'paid' });
      await User.findByIdAndUpdate(payment.userId, { $inc: { loyaltyPoints: 5 } });
    } else if (status === 'failed' || status === 'cancelled') {
      payment.status = 'failed';
      await payment.save();
    }

    // Rediriger vers l'application mobile ou web
    res.redirect(`${process.env.FRONTEND_URL}/payment/result?status=${status}&order=${order_number}`);
  } catch (error) {
    console.error('Erreur callback:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Webhook FlexPay (notification automatique)
// @route   POST /api/payments/webhook
const paymentWebhook = async (req, res) => {
  try {
    const { order_number, status, transaction_id } = req.body;

    const payment = await Payment.findOne({ orderNumber: order_number });
    if (payment) {
      payment.status = status === 'success' ? 'completed' : 'failed';
      payment.transactionId = transaction_id;
      await payment.save();

      if (status === 'success') {
        await Ride.findByIdAndUpdate(payment.rideId, { paymentStatus: 'paid' });
        await User.findByIdAndUpdate(payment.userId, { $inc: { loyaltyPoints: 5 } });
      }
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Obtenir le statut d'un paiement
// @route   GET /api/payments/status/:rideId
const getPaymentStatus = async (req, res) => {
  try {
    const payment = await Payment.findOne({ rideId: req.params.rideId });
    if (!payment) {
      return res.status(404).json({ message: 'Paiement non trouvé' });
    }
    res.json({ success: true, payment });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { 
  initPayment, 
  paymentCallback, 
  paymentWebhook,
  checkPaymentStatus,
  getPaymentStatus 
};
