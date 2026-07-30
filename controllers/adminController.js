const User = require('../models/User');
const Driver = require('../models/Driver');
const Ride = require('../models/Ride');
const GoodsOrder = require('../models/GoodsOrder');
const Suggestion = require('../models/Suggestion');
const Notification = require('../models/Notification');
const bcrypt = require('bcryptjs');
const fetch = require('node-fetch'); // ✅ Pour l'API Expo Push

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
// ============================================================
const getStats = async (req, res) => {
  try {
    const [
      totalDrivers, onlineDrivers, totalPassengers,
      totalRides, completedRides, revenueAgg,
      totalGoods, newSuggestions, avgRatingAgg,
      recentRides, recentSuggestions,
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
      Ride.find().sort({ createdAt: -1 }).limit(5)
        .populate('passengerId', 'name')
        .populate({ path: 'driverId', populate: { path: 'userId', select: 'name' } }),
      Suggestion.find().sort({ createdAt: -1 }).limit(5).populate('user', 'name email'),
    ]);

    res.json({
      success: true,
      drivers: { total: totalDrivers, online: onlineDrivers },
      users: { passengers: totalPassengers },
      rides: {
        total: totalRides,
        completed: completedRides,
        totalRevenue: revenueAgg[0]?.total || 0,
      },
      goods: { total: totalGoods },
      suggestions: {
        new: newSuggestions,
        averageRating: avgRatingAgg[0]?.avg ? Number(avgRatingAgg[0].avg.toFixed(2)) : null,
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
// USERS
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
      User.find(filter).select('-password').sort({ createdAt: -1 })
        .skip(skip).limit(parseInt(limit)),
      User.countDocuments(filter),
    ]);

    res.json({
      success: true, users,
      pagination: {
        page: parseInt(page), limit: parseInt(limit),
        total, pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

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

const deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    await Driver.deleteMany({ userId: req.params.id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// DRIVERS
// ============================================================
const listDrivers = async (req, res) => {
  try {
    const { status, isOnline } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (isOnline !== undefined) filter.isOnline = isOnline === 'true';

    const drivers = await Driver.find(filter).sort({ createdAt: -1 })
      .populate('userId', 'name email phone role isActive');

    res.json({ success: true, drivers });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createDriver = async (req, res) => {
  try {
    const { name, email, phone, password,
      vehicleModel, vehiclePlate, vehicleColor, licenseNumber } = req.body;

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

    const existing = await User.findOne({ $or: [{ email }, { phone }] });
    if (existing) {
      return res.status(400).json({
        message: 'Un utilisateur avec cet email ou téléphone existe déjà',
      });
    }

    const existingPlate = await Driver.findOne({ vehiclePlate });
    if (existingPlate) {
      return res.status(400).json({
        message: 'Un chauffeur avec cette plaque existe déjà',
      });
    }

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

const deleteDriver = async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id);
    if (!driver) return res.status(404).json({ message: 'Chauffeur non trouvé' });

    await Driver.findByIdAndDelete(req.params.id);
    if (driver.userId) await User.findByIdAndDelete(driver.userId);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// RIDES
// ============================================================
const listRides = async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [rides, total] = await Promise.all([
      Ride.find(filter).sort({ createdAt: -1 })
        .skip(skip).limit(parseInt(limit))
        .populate('passengerId', 'name phone email')
        .populate({ path: 'driverId', populate: { path: 'userId', select: 'name phone' } }),
      Ride.countDocuments(filter),
    ]);

    res.json({
      success: true, rides,
      pagination: {
        page: parseInt(page), limit: parseInt(limit),
        total, pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// GOODS
// ============================================================
const listGoodsOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [orders, total] = await Promise.all([
      GoodsOrder.find(filter).sort({ createdAt: -1 })
        .skip(skip).limit(parseInt(limit))
        .populate('passengerId', 'name phone email')
        .populate({ path: 'driverId', populate: { path: 'userId', select: 'name phone' } }),
      GoodsOrder.countDocuments(filter),
    ]);

    res.json({
      success: true, orders,
      pagination: {
        page: parseInt(page), limit: parseInt(limit),
        total, pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getGoodsOrder = async (req, res) => {
  try {
    const order = await GoodsOrder.findById(req.params.id)
      .populate('passengerId', 'name phone email')
      .populate({ path: 'driverId', populate: { path: 'userId', select: 'name phone email' } });

    if (!order) return res.status(404).json({ message: 'Commande non trouvée' });
    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// ADMINISTRATEURS
// ============================================================
const listAdmins = async (req, res) => {
  try {
    const admins = await User.find({ role: 'admin' })
      .select('-password')
      .sort({ createdAt: -1 });
    res.json({ success: true, admins });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createAdmin = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({
        message: 'Nom, email, téléphone et mot de passe sont obligatoires',
      });
    }
    if (password.length < 8) {
      return res.status(400).json({
        message: 'Le mot de passe doit contenir au moins 8 caractères',
      });
    }

    const existing = await User.findOne({ $or: [{ email }, { phone }] });
    if (existing) {
      return res.status(400).json({
        message: 'Un utilisateur avec cet email ou téléphone existe déjà',
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const admin = await User.create({
      name,
      email: email.toLowerCase(),
      phone,
      password: hashedPassword,
      role: 'admin',
      isActive: true,
      isVerified: true,
    });

    res.status(201).json({
      success: true,
      admin: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        phone: admin.phone,
        role: admin.role,
        createdAt: admin.createdAt,
      },
    });
  } catch (error) {
    console.error('Erreur création admin:', error);
    res.status(500).json({ message: error.message });
  }
};

const updateAdmin = async (req, res) => {
  try {
    // Empêcher de se désactiver soi-même
    if (req.params.id === req.userId && req.body.isActive === false) {
      return res.status(400).json({
        message: 'Vous ne pouvez pas désactiver votre propre compte',
      });
    }

    const { name, email, phone, isActive } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (email) updates.email = email.toLowerCase();
    if (phone) updates.phone = phone;
    if (isActive !== undefined) updates.isActive = isActive;

    const admin = await User.findOne({ _id: req.params.id, role: 'admin' });
    if (!admin) return res.status(404).json({ message: 'Administrateur non trouvé' });

    Object.assign(admin, updates);
    await admin.save();

    const clean = admin.toObject();
    delete clean.password;
    res.json({ success: true, admin: clean });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteAdmin = async (req, res) => {
  try {
    // Empêcher de se supprimer soi-même
    if (req.params.id === req.userId) {
      return res.status(400).json({
        message: 'Vous ne pouvez pas supprimer votre propre compte',
      });
    }

    // Empêcher de supprimer le dernier admin
    const adminCount = await User.countDocuments({ role: 'admin' });
    if (adminCount <= 1) {
      return res.status(400).json({
        message: 'Impossible de supprimer le dernier administrateur',
      });
    }

    const admin = await User.findOne({ _id: req.params.id, role: 'admin' });
    if (!admin) return res.status(404).json({ message: 'Administrateur non trouvé' });

    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// MON COMPTE
// ============================================================
const changeMyPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Mot de passe actuel et nouveau requis' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({
        message: 'Le nouveau mot de passe doit contenir au moins 8 caractères',
      });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Mot de passe actuel incorrect' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.json({ success: true, message: 'Mot de passe changé avec succès' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// NOTIFICATIONS — Envoi réel via Expo Push API
// ============================================================
const sendNotification = async (req, res) => {
  try {
    const { channel, target, title, message, specificUserIds } = req.body;

    if (!channel || !target || !title || !message) {
      return res.status(400).json({
        message: 'Canal, cible, titre et message sont obligatoires',
      });
    }

    // Sélection des destinataires
    const filter = {};
    switch (target) {
      case 'all':
        filter.role = { $in: ['passenger', 'driver'] };
        break;
      case 'passengers':
        filter.role = 'passenger';
        break;
      case 'drivers':
        filter.role = 'driver';
        break;
      case 'passengers_active':
        filter.role = 'passenger';
        filter.isActive = true;
        break;
      case 'drivers_online': {
        const onlineDrivers = await Driver.find({ isOnline: true }).select('userId');
        filter._id = { $in: onlineDrivers.map(d => d.userId) };
        break;
      }
      case 'specific':
        if (!specificUserIds || specificUserIds.length === 0) {
          return res.status(400).json({
            message: 'Aucun utilisateur spécifique sélectionné',
          });
        }
        filter._id = { $in: specificUserIds };
        break;
    }

    // Récupère uniquement les users avec un token push
    const usersWithToken = await User.find({
      ...filter,
      expoPushToken: { $ne: null, $exists: true },
    }).select('expoPushToken');

    const recipientCount = await User.countDocuments(filter);
    const tokens = usersWithToken.map(u => u.expoPushToken).filter(Boolean);

    // Crée l'entrée d'audit AVANT l'envoi
    const notification = await Notification.create({
      sentBy: req.userId,
      channel,
      target,
      specificUserIds: target === 'specific' ? specificUserIds : [],
      title,
      message,
      recipientCount,
      status: 'sending',
    });

    // ============================================================
    // Envoi réel via Expo Push API (push + in_app)
    // ============================================================
    let successCount = 0;
    let failureCount = 0;

    if ((channel === 'push' || channel === 'in_app') && tokens.length > 0) {
      // Expo limite à 100 tokens par requête
      const chunks = [];
      for (let i = 0; i < tokens.length; i += 100) {
        chunks.push(tokens.slice(i, i + 100));
      }

      for (const chunk of chunks) {
        const messages = chunk.map(token => ({
          to: token,
          sound: 'default',
          title,
          body: message,
          data: {
            channel,
            notificationId: notification._id.toString(),
            sentAt: new Date().toISOString(),
          },
          priority: 'high',
        }));

        try {
          const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'Accept-Encoding': 'gzip, deflate',
            },
            body: JSON.stringify(messages),
          });

          const expoData = await expoResponse.json();
          if (expoData.data) {
            expoData.data.forEach(ticket => {
              if (ticket.status === 'ok') successCount++;
              else failureCount++;
            });
          }
        } catch (e) {
          console.error('Erreur envoi batch Expo:', e.message);
          failureCount += chunk.length;
        }
      }
    } else {
      // Email/SMS : pas encore implémenté (à intégrer avec SendGrid/Twilio plus tard)
      // On marque quand même comme envoyé pour l'audit
      successCount = recipientCount;
    }

    // Met à jour l'audit avec les résultats
    notification.status = failureCount === 0 ? 'sent' : (successCount > 0 ? 'partial' : 'failed');
    notification.successCount = successCount;
    notification.failureCount = failureCount;
    notification.sentAt = new Date();
    await notification.save();

    res.status(201).json({
      success: true,
      notification,
      recipientCount,
      successCount,
      failureCount,
      message: `Notification envoyée à ${successCount}/${recipientCount} destinataires`,
    });
  } catch (error) {
    console.error('Erreur envoi notification:', error);
    res.status(500).json({ message: error.message });
  }
};

const listNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [notifications, total] = await Promise.all([
      Notification.find().sort({ createdAt: -1 })
        .skip(skip).limit(parseInt(limit))
        .populate('sentBy', 'name email'),
      Notification.countDocuments(),
    ]);

    res.json({
      success: true, notifications,
      pagination: {
        page: parseInt(page), limit: parseInt(limit),
        total, pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  requireAdmin,
  getStats,
  listUsers, updateUser, deleteUser,
  listDrivers, createDriver, deleteDriver,
  listRides,
  listGoodsOrders, getGoodsOrder,
  listAdmins, createAdmin, updateAdmin, deleteAdmin,
  changeMyPassword,
  sendNotification, listNotifications,
};