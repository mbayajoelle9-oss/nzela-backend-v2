const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ['passenger', 'driver', 'admin'],
      default: 'passenger',
    },
    loyaltyPoints: { type: Number, default: 0 },

    // ✅ Champs OAuth social (utilisés par authController.js)
    googleId: { type: String, default: null, index: true, sparse: true },
    facebookId: { type: String, default: null, index: true, sparse: true },
    avatar: { type: String, default: null },

    // Statut du compte
    isActive: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false },
    lastLoginAt: { type: Date },

    // ✅ Notifications push (Expo)
    expoPushToken: { type: String, default: null },
    pushTokenPlatform: { type: String, enum: ['ios', 'android', null], default: null },
    pushTokenUpdatedAt: { type: Date, default: null },
  },
  { timestamps: true } // ✅ ajoute createdAt + updatedAt automatiquement
);

module.exports = mongoose.model('User', userSchema);




