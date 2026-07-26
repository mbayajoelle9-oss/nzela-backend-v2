const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  requireAdmin,
  getStats,
  listUsers, updateUser, deleteUser,
  listDrivers, createDriver, deleteDriver,
  listRides,
  listGoodsOrders, getGoodsOrder,
  listAdmins, createAdmin, updateAdmin, deleteAdmin,
  changeMyPassword,
  sendNotification, listNotifications,
} = require('../controllers/adminController');

// Toutes les routes admin nécessitent : (1) token valide, (2) rôle admin
router.use(protect);
router.use(requireAdmin);

// ---------- Dashboard ----------
router.get('/stats', getStats);

// ---------- Users ----------
router.get('/users', listUsers);
router.patch('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);

// ---------- Drivers ----------
router.get('/drivers', listDrivers);
router.post('/drivers', createDriver);
router.delete('/drivers/:id', deleteDriver);

// ---------- Rides ----------
router.get('/rides', listRides);

// ---------- Goods ----------
router.get('/goods', listGoodsOrders);
router.get('/goods/:id', getGoodsOrder);

// ---------- Administrators (nouveau) ----------
router.get('/administrators', listAdmins);
router.post('/administrators', createAdmin);
router.patch('/administrators/:id', updateAdmin);
router.delete('/administrators/:id', deleteAdmin);

// ---------- Mon compte (nouveau) ----------
router.patch('/me/password', changeMyPassword);

// ---------- Notifications (nouveau) ----------
router.get('/notifications', listNotifications);
router.post('/notifications/broadcast', sendNotification);

module.exports = router;
