const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  createGoodsOrder,
  findNearestDriver,
  getDriverStatus,
  getMyOrders,
  updateOrderStatus,
} = require('../controllers/goodsController');

// Toutes les routes goods nécessitent un utilisateur connecté
router.post('/create', protect, createGoodsOrder);
router.get('/mine', protect, getMyOrders);
router.get('/:id/nearest-driver', protect, findNearestDriver);
router.get('/:id/driver-status', protect, getDriverStatus);
router.patch('/:id/status', protect, updateOrderStatus);

module.exports = router;
