const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  // Course payée (uniquement pour type = 'ride')
  rideId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ride' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // ride = paiement d'une course · topup = recharge du portefeuille
  // transfer_out / transfer_in = transfert entre deux utilisateurs
  type: {
    type: String,
    enum: ['ride', 'topup', 'transfer_out', 'transfer_in'],
    default: 'ride',
  },

  amount: { type: Number, required: true },
  currency: { type: String, default: 'CDF' },
  method: { type: String, enum: ['mobile_money', 'card', 'cash', 'wallet'], required: true },
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  transactionId: { type: String },
  provider: { type: String, default: 'flexpay' },
  phoneNumber: { type: String },
  orderNumber: { type: String, index: true },

  // Recharge : passe à true au moment où le solde est crédité (garantit qu'on ne crédite qu'une fois)
  credited: { type: Boolean, default: false },

  // Transferts : l'autre partie
  counterpartId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  counterpartName: { type: String },

  createdAt: { type: Date, default: Date.now }
});

paymentSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Payment', paymentSchema);
