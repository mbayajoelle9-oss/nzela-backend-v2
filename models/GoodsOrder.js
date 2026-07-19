const mongoose = require('mongoose');

const goodsOrderSchema = new mongoose.Schema(
  {
    passengerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      default: null,
    },

    // Type et caractéristiques du colis
    goodsType: {
      type: String,
      enum: ['standard', 'fragile', 'urgent'],
      required: true,
    },
    weight: { type: Number, default: 0 }, // en kg
    dimensions: { type: String, default: '' }, // ex: "30x20x15 cm"
    description: { type: String, default: '' },

    // Points de collecte et livraison
    pickup: {
      lat: { type: Number },
      lng: { type: Number },
      address: { type: String, required: true },
    },
    dropoff: {
      lat: { type: Number },
      lng: { type: Number },
      address: { type: String, required: true },
    },

    // Prix
    price: { type: Number, required: true },
    priceFormatted: { type: String },

    // Statut de la commande
    status: {
      type: String,
      enum: [
        'pending',       // Commande créée, en attente d'un chauffeur
        'assigned',      // Un chauffeur a été assigné
        'picked_up',     // Chauffeur a récupéré le colis
        'in_transit',    // En cours de livraison
        'delivered',     // Livré au destinataire
        'cancelled',
      ],
      default: 'pending',
    },

    paymentMethod: {
      type: String,
      enum: ['mobile_money', 'card', 'cash'],
      default: 'cash',
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'refunded'],
      default: 'pending',
    },

    // Métadonnées pour le suivi
    assignedAt: Date,
    pickedUpAt: Date,
    deliveredAt: Date,
    cancelledAt: Date,
    cancelReason: String,
  },
  { timestamps: true }
);

goodsOrderSchema.index({ status: 1, createdAt: -1 });
goodsOrderSchema.index({ passengerId: 1, createdAt: -1 });
goodsOrderSchema.index({ driverId: 1, status: 1 });

module.exports = mongoose.model('GoodsOrder', goodsOrderSchema);
