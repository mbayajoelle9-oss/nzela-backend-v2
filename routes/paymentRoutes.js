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

router.post('/init', protect, initPayment);
router.post('/callback', paymentCallback);
router.post('/webhook', paymentWebhook);
router.get('/check/:orderNumber', checkPaymentStatus);
router.get('/status/:rideId', protect, getPaymentStatus);

module.exports = router;

