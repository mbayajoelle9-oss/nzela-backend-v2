const mongoose = require('mongoose');

const suggestionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // Un user non-connecté peut aussi soumettre
    },
    category: {
      type: String,
      enum: ['app', 'driver', 'price', 'feature', 'bug', 'other'],
      required: true,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },
    message: {
      type: String,
      required: true,
      minlength: 10,
      maxlength: 500,
      trim: true,
    },
    status: {
      type: String,
      enum: ['new', 'read', 'in_review', 'resolved', 'closed'],
      default: 'new',
    },
    adminNote: {
      type: String,
      default: null,
    },
    device: {
      platform: String, // "android" | "ios"
      appVersion: String,
    },
  },
  { timestamps: true }
);

// Index utiles pour l'admin (pour lister par statut/date)
suggestionSchema.index({ status: 1, createdAt: -1 });
suggestionSchema.index({ category: 1, createdAt: -1 });

module.exports = mongoose.model('Suggestion', suggestionSchema);
