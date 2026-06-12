const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  registerDriver,
  updateLocation,
  updateStatus,
  getDriverProfile,
  getNearbyDrivers
} = require('../controllers/driverController');

router.post('/register', protect, registerDriver);
router.put('/location', protect, updateLocation);
router.put('/status', protect, updateStatus);
router.get('/profile', protect, getDriverProfile);
router.get('/nearby', protect, getNearbyDrivers);

module.exports = router;
