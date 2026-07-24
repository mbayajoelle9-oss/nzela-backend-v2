const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  requireAdmin,
  getStats,
  listUsers,
  listDrivers,
  listRides,
  listGoodsOrders,
  getGoodsOrder,
  updateUser,
  deleteUser,
} = require('../controllers/adminController');

// Toutes les routes admin nécessitent : (1) un token valide, (2) le rôle admin
router.use(protect);
router.use(requireAdmin);

// Dashboard
router.get('/stats', getStats);

// Users
router.get('/users', listUsers);
router.patch('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);

// Drivers
router.get('/drivers', listDrivers);

// Rides
router.get('/rides', listRides);

// Goods
router.get('/goods', listGoodsOrders);
router.get('/goods/:id', getGoodsOrder);

module.exports = router;
