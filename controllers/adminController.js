const User = require('../models/User');
const Driver = require('../models/Driver');
const Ride = require('../models/Ride');
const GoodsOrder = require('../models/GoodsOrder');
const Suggestion = require('../models/Suggestion');
const bcrypt = require('bcryptjs');

// ============================================================
// Middleware : n'autorise que les admins
// ============================================================
const requireAdmin = (req, res, next) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ message: 'Accès réservé aux administrateurs' });
  }
  next();
};

// ============================================================
// GET /api/admin/stats
// Statistiques agrégées pour le dashboard
// ============================================================
const getStats = async (req, res) => {
  try {
    // Exécution en parallèle pour aller vite
    const [
      totalDrivers,
      onlineDrivers,
      totalPassengers,
      totalRides,
      completedRides,
      revenueAgg,
      totalGoods,
      newSuggestions,
      avgRatingAgg,
      recentRides,
      recentSuggestions,
    ] = await Promise.all([
      Driver.countDocuments(),
      Driver.countDocuments({ isOnline: true, status: 'available' }),
      User.countDocuments({ role: 'passenger' }),
      Ride.countDocuments(),
      Ride.countDocuments({ status: 'completed' }),
      Ride.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$price' } } },
      ]),
      GoodsOrder.countDocuments(),
      Suggestion.countDocuments({ status: 'new' }),
      Suggestion.aggregate([
        { $match: { rating: { $ne: null } } },
        { $group: { _id: null, avg: { $avg: '$rating' } } },
      ]),
      Ride.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('passengerId', 'name')
        .populate({
          path: 'driverId',
          populate: { path: 'userId', select: 'name' },
        }),
      Suggestion.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('user', 'name email'),
    ]);

    res.json({
      success: true,
      drivers: {
        total: totalDrivers,
        online: onlineDrivers,
      },
      users: {
        passengers: totalPassengers,
      },
      rides: {
        total: totalRides,
        completed: completedRides,
        totalRevenue: revenueAgg[0]?.total || 0,
      },
      goods: {
        total: totalGoods,
      },
      suggestions: {
        new: newSuggestions,
        averageRating: avgRatingAgg[0]?.avg
          ? Number(avgRatingAgg[0].avg.toFixed(2))
          : null,
      },
      recentRides,
      recentSuggestions,
    });
  } catch (error) {
    console.error('Erreur admin stats:', error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// GET /api/admin/users
// Liste paginée des passagers
// ============================================================
const listUsers = async (req, res) => {
  try {
    const { role, page = 1, limit = 20, search } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(filter),
    ]);

    res.json({
      success: true,
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// GET /api/admin/drivers
// Liste de tous les chauffeurs avec leur user peuplé
// ============================================================
const listDrivers = async (req, res) => {
  try {
    const { status, isOnline } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (isOnline !== undefined) filter.isOnline = isOnline === 'true';

    const drivers = await Driver.find(filter)
      .sort({ createdAt: -1 })
      .populate('userId', 'name email phone role isActive');

    res.json({ success: true, drivers });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// POST /api/admin/drivers
// Créer un nouveau chauffeur (compte User + doc Driver)
// ============================================================
const createDriver = async (req, res) => {
  try {
    const {
      name, email, phone, password,
      vehicleModel, vehiclePlate, vehicleColor, licenseNumber,
    } = req.body;

    // Validation
    if (!name || !email || !phone || !password) {
      return res.status(400).json({
        message: 'Nom, email, téléphone et mot de passe sont obligatoires',
      });
    }
    if (!vehicleModel || !vehiclePlate) {
      return res.status(400).json({
        message: 'Modèle et plaque du véhicule sont obligatoires',
      });
    }

    // Vérifier que l'email/phone n'existe pas déjà
    const existing = await User.findOne({ $or: [{ email }, { phone }] });
    if (existing) {
      return res.status(400).json({
        message: 'Un utilisateur avec cet email ou téléphone existe déjà',
      });
    }

    // Vérifier la plaque
    const existingPlate = await Driver.findOne({ vehiclePlate });
    if (existingPlate) {
      return res.status(400).json({
        message: 'Un chauffeur avec cette plaque existe déjà',
      });
    }

    // 1. Créer le User
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      phone,
      password: hashedPassword,
      role: 'driver',
      isActive: true,
    });

    // 2. Créer le doc Driver associé
    const driver = await Driver.create({
      userId: user._id,
      vehicleModel,
      vehiclePlate,
      vehicleColor: vehicleColor || 'Non spécifié',
      licenseNumber: licenseNumber || 'Non spécifié',
      isOnline: false,
      status: 'offline',
    });

    res.status(201).json({
      success: true,
      driver: {
        _id: driver._id,
        userId: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        vehicleModel: driver.vehicleModel,
        vehiclePlate: driver.vehiclePlate,
      },
    });
  } catch (error) {
    console.error('Erreur création chauffeur:', error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// DELETE /api/admin/drivers/:id
// Supprimer un chauffeur (et son compte User associé)
// ============================================================
const deleteDriver = async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id);
    if (!driver) {
      return res.status(404).json({ message: 'Chauffeur non trouvé' });
    }

    // Supprimer le doc Driver + le user associé
    await Driver.findByIdAndDelete(req.params.id);
    if (driver.userId) {
      await User.findByIdAndDelete(driver.userId);
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// GET /api/admin/rides
// Liste des courses avec filtres
// ============================================================
const listRides = async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [rides, total] = await Promise.all([
      Ride.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('passengerId', 'name phone email')
        .populate({
          path: 'driverId',
          populate: { path: 'userId', select: 'name phone' },
        }),
      Ride.countDocuments(filter),
    ]);

    res.json({
      success: true,
      rides,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// GET /api/admin/goods
// Liste des commandes de transport de biens
// ============================================================
const listGoodsOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [orders, total] = await Promise.all([
      GoodsOrder.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('passengerId', 'name phone email')
        .populate({
          path: 'driverId',
          populate: { path: 'userId', select: 'name phone' },
        }),
      GoodsOrder.countDocuments(filter),
    ]);

    res.json({
      success: true,
      orders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// GET /api/admin/goods/:id
// Détail d'une commande
// ============================================================
const getGoodsOrder = async (req, res) => {
  try {
    const order = await GoodsOrder.findById(req.params.id)
      .populate('passengerId', 'name phone email')
      .populate({
        path: 'driverId',
        populate: { path: 'userId', select: 'name phone email' },
      });

    if (!order) return res.status(404).json({ message: 'Commande non trouvée' });
    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// PATCH /api/admin/users/:id
// Activer/désactiver un user, changer son rôle
// ============================================================
const updateUser = async (req, res) => {
  try {
    const { isActive, role } = req.body;
    const updates = {};
    if (isActive !== undefined) updates.isActive = isActive;
    if (role && ['passenger', 'driver', 'admin'].includes(role)) updates.role = role;

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true })
      .select('-password');
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });

    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// DELETE /api/admin/users/:id
// Supprimer un compte utilisateur
// ============================================================
const deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    // Si c'était un chauffeur, on supprime aussi son doc Driver
    await Driver.deleteMany({ userId: req.params.id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  requireAdmin,
  getStats,
  listUsers,
  listDrivers,
  createDriver,
  deleteDriver,
  listRides,
  listGoodsOrders,
  getGoodsOrder,
  updateUser,
  deleteUser,
};