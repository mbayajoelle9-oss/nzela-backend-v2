const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  vehicleModel: { type: String, required: true },
  vehiclePlate: { type: String, required: true, unique: true },
  vehicleColor: { type: String, required: true },
  licenseNumber: { type: String, required: true },
  isOnline: { type: Boolean, default: false },
  currentLocation: {
    lat: { type: Number },
    lng: { type: Number }
  },
  rating: { type: Number, default: 5 },
  totalTrips: { type: Number, default: 0 },
  status: { type: String, enum: ['available', 'busy', 'offline'], default: 'offline' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Driver', driverSchema);
