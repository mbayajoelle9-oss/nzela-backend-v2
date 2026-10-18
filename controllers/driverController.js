const Driver = require('../models/Driver');
const User = require('../models/User');
const Ride = require('../models/Ride');

// @desc    Devenir chauffeur
// @route   POST /api/drivers/register
const registerDriver = async (req, res) => {
  try {
    const { vehicleModel, vehiclePlate, vehicleColor, licenseNumber } = req.body;

    // Vérifier si déjà chauffeur
    const existingDriver = await Driver.findOne({ userId: req.userId });
    if (existingDriver) {
      return res.status(400).json({ message: 'Vous êtes déjà chauffeur' });
    }

    const driver = await Driver.create({
      userId: req.userId,
      vehicleModel,
      vehiclePlate,
      vehicleColor,
      licenseNumber
    });

    // Mettre à jour le rôle de l'utilisateur
    await User.findByIdAndUpdate(req.userId, { role: 'driver' });

    res.status(201).json({ success: true, driver });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Mettre à jour position chauffeur
// @route   PUT /api/drivers/location
const updateLocation = async (req, res) => {
  try {
    const { lat, lng } = req.body;
    const driver = await Driver.findOne({ userId: req.userId });

    if (!driver) {
      return res.status(404).json({ message: 'Chauffeur non trouvé' });
    }

    driver.currentLocation = { lat, lng };
    await driver.save();

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Mettre à jour statut (en ligne/hors ligne)
// @route   PUT /api/drivers/status
const updateStatus = async (req, res) => {
  try {
    const { isOnline } = req.body;
    const driver = await Driver.findOne({ userId: req.userId });

    if (!driver) {
      return res.status(404).json({ message: 'Chauffeur non trouvé' });
    }

    driver.isOnline = isOnline;
    driver.status = isOnline ? 'available' : 'offline';
    await driver.save();

    res.json({ success: true, isOnline: driver.isOnline, status: driver.status });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Obtenir profil chauffeur
// @route   GET /api/drivers/profile
const getDriverProfile = async (req, res) => {
  try {
    const driver = await Driver.findOne({ userId: req.userId }).populate('userId', 'name phone email');

    if (!driver) {
      return res.status(404).json({ message: 'Chauffeur non trouvé' });
    }

    // Statistiques — totalEarnings = revenu NET du chauffeur (après commission EKOMI 15%),
    // pas le prix brut de la course
    const totalTrips = await Ride.countDocuments({ driverId: driver._id, status: 'completed' });
    const totalEarnings = await Ride.aggregate([
      { $match: { driverId: driver._id, status: 'completed' } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$driverEarnings', { $multiply: ['$price', 0.85] }] } } } }
    ]);

    res.json({
      success: true,
      driver,
      stats: {
        totalTrips,
        totalEarnings: totalEarnings[0]?.total || 0,
        rating: driver.rating
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Statistiques du jour (courses, revenus nets, note)
// @route   GET /api/drivers/stats/today
const getTodayStats = async (req, res) => {
  try {
    const driver = await Driver.findOne({ userId: req.userId });
    if (!driver) {
      return res.status(404).json({ message: 'Chauffeur non trouvé' });
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const todayRides = await Ride.find({
      driverId: driver._id,
      status: 'completed',
      completedAt: { $gte: startOfDay },
    });

    // driverEarnings est déjà le montant NET (après commission EKOMI de 15%),
    // calculé à la clôture de chaque course — on retombe sur le prix brut
    // en fallback pour les anciennes courses closes avant ce correctif.
    const earnings = todayRides.reduce((sum, ride) => {
      const net = ride.driverEarnings ?? Math.round((ride.price || 0) * 0.85);
      return sum + net;
    }, 0);

    res.json({
      success: true,
      stats: {
        rides: todayRides.length,
        earnings,
        rating: driver.rating,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Trouver chauffeurs proches (matching)
// @route   GET /api/drivers/nearby
const getNearbyDrivers = async (req, res) => {
  try {
    const { lat, lng, radius = 5 } = req.query;

    const drivers = await Driver.find({
      isOnline: true,
      status: 'available',
'currentLocation.lat': { $exists: true }
    }).populate('userId', 'name phone');

    // Calculer distance (simplifié)
    const nearbyDrivers = drivers.filter(driver => {
      const distance = calculateDistance(
        parseFloat(lat),
        parseFloat(lng),
        driver.currentLocation.lat,
        driver.currentLocation.lng
      );
      return distance <= radius;
    });

    res.json({ success: true, drivers: nearbyDrivers });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

module.exports = {
  registerDriver,
  updateLocation,
  updateStatus,
  getDriverProfile,
  getTodayStats,
  getNearbyDrivers
};

// NOTE : le calcul commission EKOMI (15%) / revenu chauffeur (85%) vit maintenant
// dans utils/priceCalculator.js (splitCommission), appliqué dans rideController.js
// à la clôture de chaque course — source unique pour Taxi, Transport de biens et Location.
// L'ancien calcul local à 20% et le payout automatique Mobile Money (jamais branché,
// `transferToMobileMoney` n'existait pas) ont été retirés pour éviter toute incohérence.
