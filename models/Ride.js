const mongoose = require('mongoose');

const rideSchema = new mongoose.Schema({
  passengerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver' },
  rideType: { type: String, enum: ['classique', 'partagee', 'premium'], required: true },
  pickup: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    address: { type: String }
  },
  destination: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    address: { type: String }
  },
  distance: { type: Number }, // en km
  duration: { type: Number }, // en minutes
  price: { type: Number },
  status: { 
    type: String, 
    enum: ['pending', 'accepted', 'ongoing', 'completed', 'cancelled'],
    default: 'pending'
  },
  paymentMethod: { type: String, enum: ['mobile_money', 'card', 'cash'] },
  paymentStatus: { type: String, enum: ['pending', 'paid'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  completedAt: { type: Date }
});

module.exports = mongoose.model('Ride', rideSchema);
