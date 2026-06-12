const mongoose = require('mongoose');

const gpsDeviceSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, unique: true },
  driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver' },
  vehiclePlate: { type: String, required: true },
  lastLocation: {
    lat: { type: Number },
    lng: { type: Number },
    timestamp: { type: Date }
  },
  isActive: { type: Boolean, default: true },
  batteryLevel: { type: Number },
  alerts: [{ type: String, timestamp: Date }]
});

module.exports = mongoose.model('GpsDevice', gpsDeviceSchema);
