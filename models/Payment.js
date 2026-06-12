const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  rideId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ride', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'CDF' },
  method: { type: String, enum: ['mobile_money', 'card', 'cash'], required: true },
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  transactionId: { type: String },
  provider: { type: String, default: 'flexpay' },
  phoneNumber: { type: String },
  orderNumber: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Payment', paymentSchema);
