const mongoose = require('mongoose');

const zoneSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['green', 'red', 'yellow'], default: 'green' },
  coordinates: {
    type: { type: String, default: 'Polygon' },
    coordinates: [[[Number]]]
  },
  center: { lat: Number, lng: Number },
  radius: { type: Number }, // en km pour zones circulaires
  message: { type: String }, // message d'alerte pour zones rouges
  isActive: { type: Boolean, default: true }
});

module.exports = mongoose.model('Zone', zoneSchema);
