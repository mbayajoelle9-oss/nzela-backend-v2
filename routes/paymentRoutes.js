const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  initPayment,
  paymentCallback,
  paymentWebhook,
  checkPaymentStatus,
  getPaymentStatus
} = require('../controllers/paymentController');
const {
  initTopup,
  checkTopup,
  getWallet,
  lookupRecipient,
  transfer,
} = require('../controllers/walletController');

router.post('/init', protect, initPayment);
router.post('/callback', paymentCallback);
router.post('/webhook', paymentWebhook);
router.get('/check/:orderNumber', checkPaymentStatus);
router.get('/status/:rideId', protect, getPaymentStatus);

// Portefeuille
router.post('/topup', protect, initTopup);
router.get('/topup/:orderNumber', protect, checkTopup);
router.get('/wallet', protect, getWallet);
router.get('/wallet/recipient', protect, lookupRecipient);
router.post('/wallet/transfer', protect, transfer);

module.exports = router;
