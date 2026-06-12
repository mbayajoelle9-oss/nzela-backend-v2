// Vérification alignement position (GPS physique vs app chauffeur)
const checkLocationAlignment = async (driverId, appLat, appLng) => {
  const gps = await GpsDevice.findOne({ driverId });
  if (!gps) return { aligned: true };

  const distance = calculateDistance(
    appLat, appLng,
    gps.lastLocation.lat, gps.lastLocation.lng
  );

  // Alerte si écart > 500m
  if (distance > 0.5) {
    return { aligned: false, difference: `${distance.toFixed(2)} km` };
  }

  return { aligned: true };
};
