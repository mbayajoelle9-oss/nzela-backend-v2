const GoodsOrder = require('../models/GoodsOrder');
const Driver = require('../models/Driver');
const User = require('../models/User');

// ============================================================
// UTILITAIRES
// ============================================================

/**
 * Calcule la distance à vol d'oiseau entre 2 points GPS (formule Haversine)
 * @returns distance en kilomètres
 */
function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371; // rayon Terre en km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Formate un prix en CDF avec séparateurs de milliers
 */
function formatPriceCDF(amount) {
  return `${Math.round(amount).toLocaleString('fr-FR')} CDF`;
}

// ============================================================
// POST /api/goods/create
// Créer une commande de transport de biens
// ============================================================
const createGoodsOrder = async (req, res) => {
  try {
    const {
      goodsType,
      weight,
      dimensions,
      description,
      pickup,
      dropoff,
      price,
      paymentMethod,
    } = req.body;

    // Validation
    if (!goodsType || !pickup?.address || !dropoff?.address) {
      return res.status(400).json({
        message: 'Point de collecte, point de livraison et type sont requis',
      });
    }
    if (!price || price <= 0) {
      return res.status(400).json({ message: 'Prix invalide' });
    }

    const order = await GoodsOrder.create({
      passengerId: req.userId,
      goodsType,
      weight: weight || 0,
      dimensions: dimensions || '',
      description: description || '',
      pickup,
      dropoff,
      price,
      priceFormatted: formatPriceCDF(price),
      paymentMethod: paymentMethod || 'cash',
      status: 'pending',
    });

    res.status(201).json({ success: true, order });
  } catch (error) {
    console.error('Erreur création commande goods:', error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// GET /api/goods/:id/nearest-driver
// Trouve le chauffeur disponible le plus proche du point de collecte
// et l'assigne à la commande
// ============================================================
const findNearestDriver = async (req, res) => {
  try {
    const order = await GoodsOrder.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Commande non trouvée' });
    }
    if (order.passengerId.toString() !== req.userId && req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Accès refusé' });
    }

    // Si un chauffeur est déjà assigné, on renvoie ses infos
    if (order.driverId && order.status !== 'pending') {
      return getDriverInfoForOrder(order, res);
    }

    // Recherche de tous les chauffeurs disponibles avec position connue
    const availableDrivers = await Driver.find({
      isOnline: true,
      status: 'available',
      'currentLocation.lat': { $exists: true, $ne: null },
      'currentLocation.lng': { $exists: true, $ne: null },
    }).populate('userId', 'name phone email');

    if (availableDrivers.length === 0) {
      return res.json({
        driver: null,
        message: 'Aucun chauffeur disponible pour le moment',
      });
    }

    // Point de collecte
    const pickupLat = order.pickup.lat;
    const pickupLng = order.pickup.lng;

    if (!pickupLat || !pickupLng) {
      return res.status(400).json({
        message: 'Coordonnées GPS du point de collecte manquantes',
      });
    }

    // Calcul de la distance pour chaque chauffeur, tri par proximité
    const driversWithDistance = availableDrivers
      .map((d) => ({
        driver: d,
        distance: haversineKm(
          pickupLat,
          pickupLng,
          d.currentLocation.lat,
          d.currentLocation.lng
        ),
      }))
      .filter((d) => d.distance <= 15) // Ignore les chauffeurs à plus de 15 km
      .sort((a, b) => a.distance - b.distance);

    if (driversWithDistance.length === 0) {
      return res.json({
        driver: null,
        message: 'Aucun chauffeur à moins de 15 km',
      });
    }

    const nearest = driversWithDistance[0];
    const driver = nearest.driver;
    const distance = nearest.distance;

    // Assigne le chauffeur à la commande
    order.driverId = driver._id;
    order.status = 'assigned';
    order.assignedAt = new Date();
    await order.save();

    // Marque le chauffeur comme occupé
    driver.status = 'busy';
    await driver.save();

    res.json({
      success: true,
      driver: buildDriverPayload(driver, distance),
    });
  } catch (error) {
    console.error('Erreur recherche chauffeur:', error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// GET /api/goods/:id/driver-status
// Rafraîchit la position et l'ETA du chauffeur assigné
// (utilisé par le polling toutes les 10s côté frontend)
// ============================================================
const getDriverStatus = async (req, res) => {
  try {
    const order = await GoodsOrder.findById(req.params.id).populate({
      path: 'driverId',
      populate: { path: 'userId', select: 'name phone email' },
    });

    if (!order) {
      return res.status(404).json({ message: 'Commande non trouvée' });
    }
    if (order.passengerId.toString() !== req.userId && req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Accès refusé' });
    }
    if (!order.driverId) {
      return res.json({ driver: null, status: order.status });
    }

    const driver = order.driverId;
    let distance = null;
    if (
      order.pickup?.lat &&
      driver.currentLocation?.lat &&
      driver.currentLocation?.lng
    ) {
      distance = haversineKm(
        order.pickup.lat,
        order.pickup.lng,
        driver.currentLocation.lat,
        driver.currentLocation.lng
      );
    }

    res.json({
      success: true,
      status: order.status,
      driver: buildDriverPayload(driver, distance),
    });
  } catch (error) {
    console.error('Erreur statut chauffeur:', error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// GET /api/goods/mine
// Historique de mes commandes (pour le client)
// ============================================================
const getMyOrders = async (req, res) => {
  try {
    const orders = await GoodsOrder.find({ passengerId: req.userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate({
        path: 'driverId',
        select: 'vehicleModel vehiclePlate rating',
        populate: { path: 'userId', select: 'name phone' },
      });

    res.json({ success: true, orders });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// PATCH /api/goods/:id/status
// Mettre à jour le statut (chauffeur ou passager)
// ============================================================
const updateOrderStatus = async (req, res) => {
  try {
    const { status, cancelReason } = req.body;
    const validStatuses = [
      'pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'cancelled',
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Statut invalide' });
    }

    const order = await GoodsOrder.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Commande non trouvée' });
    }

    // Autorisation : le passager, le chauffeur assigné, ou un admin
    const isPassenger = order.passengerId.toString() === req.userId;
    const isAssignedDriver =
      order.driverId && order.driverId.toString() === req.userId;
    const isAdmin = req.userRole === 'admin';
    if (!isPassenger && !isAssignedDriver && !isAdmin) {
      return res.status(403).json({ message: 'Accès refusé' });
    }

    order.status = status;
    if (status === 'picked_up') order.pickedUpAt = new Date();
    if (status === 'delivered') order.deliveredAt = new Date();
    if (status === 'cancelled') {
      order.cancelledAt = new Date();
      order.cancelReason = cancelReason || null;
      // Libère le chauffeur
      if (order.driverId) {
        await Driver.findByIdAndUpdate(order.driverId, { status: 'available' });
      }
    }
    if (status === 'delivered' && order.driverId) {
      // Libère le chauffeur après livraison
      await Driver.findByIdAndUpdate(order.driverId, { status: 'available' });
    }

    await order.save();
    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// Helpers internes
// ============================================================

function buildDriverPayload(driver, distanceKm) {
  const user = driver.userId || {};
  return {
    _id: driver._id,
    name: user.name || 'Chauffeur',
    phone: user.phone || null,
    rating: driver.rating || 5,
    completedRides: driver.totalTrips || 0,
    vehicle: driver.vehicleModel || 'Véhicule',
    plate: driver.vehiclePlate || null,
    avatar: null, // ajoute ce champ dans le User model si besoin
    location: driver.currentLocation || null,
    distance: distanceKm !== null ? Number(distanceKm.toFixed(2)) : null,
    // ETA approximatif : 3 minutes par km en zone urbaine (Kinshasa moyenne)
    eta: distanceKm !== null ? Math.max(3, Math.round(distanceKm * 3)) : null,
  };
}

async function getDriverInfoForOrder(order, res) {
  const driver = await Driver.findById(order.driverId).populate(
    'userId',
    'name phone email'
  );
  if (!driver) {
    return res.json({ driver: null });
  }
  let distance = null;
  if (
    order.pickup?.lat &&
    driver.currentLocation?.lat &&
    driver.currentLocation?.lng
  ) {
    distance = haversineKm(
      order.pickup.lat,
      order.pickup.lng,
      driver.currentLocation.lat,
      driver.currentLocation.lng
    );
  }
  return res.json({
    success: true,
    driver: buildDriverPayload(driver, distance),
  });
}

module.exports = {
  createGoodsOrder,
  findNearestDriver,
  getDriverStatus,
  getMyOrders,
  updateOrderStatus,
};
