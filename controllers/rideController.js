const Ride = require('../models/Ride');
const Driver = require('../models/Driver');
const User = require('../models/User');
const { calculatePrice } = require('../utils/priceCalculator');
const { getDistanceAndDuration } = require('../utils/distanceMatrix');

// @desc    Estimation du prix
const estimatePrice = async (req, res) => {
  try {
    const { pickup, destination, rideType } = req.body;
    const { distance, duration } = await getDistanceAndDuration(
      pickup.lat, pickup.lng,
      destination.lat, destination.lng
    );
    const price = calculatePrice(distance, duration, rideType);
    res.json({
      success: true,
      distance,
      duration,
      price,
      priceFormatted: `${price.toLocaleString()} CDF`
    });
  } catch (error) {
    res.status(500).json({ message: 'Erreur calcul prix', error: error.message });
  }
};

// @desc    Créer une course
const createRide = async (req, res) => {
  try {
    const { pickup, destination, rideType, paymentMethod } = req.body;
    const { distance, duration } = await getDistanceAndDuration(
      pickup.lat, pickup.lng,
      destination.lat, destination.lng
    );
    const price = calculatePrice(distance, duration, rideType);
    const availableDriver = await Driver.findOne({
      isOnline: true,
      status: 'available'
    });
    const ride = new Ride({
      passengerId: req.userId,
      driverId: availableDriver?._id || null,
      rideType,
      pickup,
      destination,
      distance,
      duration,
      price,
      paymentMethod,
      status: availableDriver ? 'accepted' : 'pending'
    });
    await ride.save();
    if (availableDriver) {
      availableDriver.status = 'busy';
      await availableDriver.save();
    }
    await User.findByIdAndUpdate(req.userId, {
      $inc: { loyaltyPoints: 10 }
    });
    res.status(201).json({
      success: true,
      ride,
      driver: availableDriver
    });
  } catch (error) {
    res.status(500).json({ message: 'Erreur création course', error: error.message });
  }
};

// @desc    Statut d'une course
const getRideStatus = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.rideId)
      .populate('passengerId', 'name phone')
      .populate('driverId');
    if (!ride) {
      return res.status(404).json({ message: 'Course non trouvée' });
    }
    res.json({ success: true, ride });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Historique des courses
const getRideHistory = async (req, res) => {
  try {
    const rides = await Ride.find({ passengerId: req.userId })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ success: true, rides });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Mettre à jour statut course
const updateRideStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const ride = await Ride.findById(req.params.rideId);
    if (!ride) {
      return res.status(404).json({ message: 'Course non trouvée' });
    }
    ride.status = status;
    if (status === 'completed') {
      ride.completedAt = new Date();
    }
    await ride.save();
    if (ride.driverId && (status === 'completed' || status === 'cancelled')) {
      await Driver.findByIdAndUpdate(ride.driverId, {
        status: 'available',
        isOnline: true
      });
    }
    res.json({ success: true, ride });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  estimatePrice,
  createRide,
  getRideStatus,
  getRideHistory,
  updateRideStatus
};
