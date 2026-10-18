const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  registerDriver,
  updateLocation,
  updateStatus,
  getDriverProfile,
  getTodayStats,
  getNearbyDrivers
} = require('../controllers/driverController');

router.post('/register', protect, registerDriver);
router.put('/location', protect, updateLocation);
// PATCH : méthode utilisée par l'app (DriverDashboardScreen). PUT conservé en alias
// de compatibilité si d'autres clients l'appellent encore.
router.patch('/status', protect, updateStatus);
router.put('/status', protect, updateStatus);
router.get('/profile', protect, getDriverProfile);
router.get('/stats/today', protect, getTodayStats);
router.get('/nearby', protect, getNearbyDrivers);

module.exports = router;
