const mongoose = require('mongoose');

const rentalSchema = new mongoose.Schema({
  vehicleType: { 
    type: String, 
    enum: ['berline', 'suv', 'minibus', 'utilitaire', 'luxe'],
    required: true 
  },
  eventType: {
    type: String,
    enum: ['mariage', 'anniversaire', 'excursion', 'course_journaliere', 'demenagement', 'amenagement'],
    required: true
  },
  vehicle: {
    model: String,
    brand: String,
    plate: String,
    capacity: Number,
    hasAc: Boolean
  },
  driver: {
    name: String,
    phone: String,
    isProvided: { type: Boolean, default: true } // chauffeur fourni ou non
  },
  price: {
    perHour: Number,
    perDay: Number,
    perEvent: Number
  },
  availability: {
    isAvailable: { type: Boolean, default: true },
    availableDates: [Date],
    nextAvailable: Date
  },
  images: [String],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('VehicleRental', rentalSchema);
