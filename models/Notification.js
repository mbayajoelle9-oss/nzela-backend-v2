const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    // Auteur (admin qui a envoyé)
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Type d'envoi
    channel: {
      type: String,
      enum: ['push', 'email', 'sms', 'in_app'],
      required: true,
    },

    // Cible
    target: {
      type: String,
      enum: ['all', 'passengers', 'drivers', 'passengers_active', 'drivers_online', 'specific'],
      required: true,
    },
    specificUserIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],

    // Contenu
    title: { type: String, required: true, maxlength: 100 },
    message: { type: String, required: true, maxlength: 1000 },

    // État de l'envoi
    status: {
      type: String,
      enum: ['pending', 'sending', 'sent', 'failed', 'partial'],
      default: 'pending',
    },
    recipientCount: { type: Number, default: 0 },
    successCount: { type: Number, default: 0 },
    failureCount: { type: Number, default: 0 },
    errorMessage: String,
    sentAt: Date,
  },
  { timestamps: true }
);

notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ sentBy: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
