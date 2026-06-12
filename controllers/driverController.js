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

    // Statistiques
    const totalTrips = await Ride.countDocuments({ driverId: driver._id, status: 'completed' });
    const totalEarnings = await Ride.aggregate([
      { $match: { driverId: driver._id, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$price' } } }
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
  getNearbyDrivers
};

// Commission N'ZELA: 20%
const COMMISSION_RATE = 0.20;

// Calcul revenu chauffeur
const calculateDriverEarnings = (ridePrice) => {
  const commission = ridePrice * COMMISSION_RATE;
  const driverEarnings = ridePrice - commission;

  return {
    total: ridePrice,
    commission: Math.ceil(commission),
    driverEarnings: Math.ceil(driverEarnings)
  };
};

// Exemple: course à 3 500 CDF
// Commission N'ZELA: 700 CDF
// Revenu chauffeur: 2 800 CDF

const payoutDrivers = async () => {
  const completedRides = await Ride.find({
    status: 'completed',
    driverPaid: false
  });

  for (const ride of completedRides) {
    const earnings = calculateDriverEarnings(ride.price);

    // Transfert Mobile Money
    await transferToMobileMoney(ride.driverId, earnings.driverEarnings);

    ride.driverPaid = true;
    await ride.save();
  }
};
