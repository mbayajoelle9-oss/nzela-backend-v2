const axios = require('axios');

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

async function getDistanceAndDuration(originLat, originLng, destLat, destLng) {
  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originLat},${originLng}&destinations=${destLat},${destLng}&key=${GOOGLE_API_KEY}`;

    const response = await axios.get(url);
    const element = response.data.rows[0].elements[0];

    return {
      distance: element.distance.value / 1000, // km
      duration: Math.ceil(element.duration.value / 60), // minutes
      distanceText: element.distance.text,
      durationText: element.duration.text
    };
  } catch (error) {
    console.error('Erreur Google Maps:', error);
    // Fallback: calcul à vol d'oiseau
    const distance = haversineDistance(originLat, originLng, destLat, destLng);
    return {
      distance: distance,
      duration: Math.ceil(distance * 3), // 3 min/km estimé
      distanceText: `${distance.toFixed(1)} km`,
      durationText: `${Math.ceil(distance * 3)} min`
    };
  }
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Rayon Terre en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

module.exports = { getDistanceAndDuration };
