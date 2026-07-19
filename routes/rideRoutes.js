const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  estimatePrice,
  createRide,
  getRideStatus,
  getRideHistory,
  updateRideStatus,
  getRecentDestinations,   // ← AJOUTE cette ligne
} = require('../controllers/rideController');

router.post('/estimate', protect, estimatePrice);
router.post('/create', protect, createRide);
router.get('/:rideId/status', protect, getRideStatus);
router.get('/history', protect, getRideHistory);
router.put('/:rideId/status', protect, updateRideStatus);
router.get('/recent', protect, getRecentDestinations);

module.exports = router;

