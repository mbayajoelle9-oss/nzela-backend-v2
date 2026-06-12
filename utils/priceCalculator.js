// Tarifs en CDF (Franc Congolais)
const RATES = {
  classique: { base: 500, perKm: 250, perMin: 40 },
  partagee: { base: 300, perKm: 150, perMin: 25 },
  premium: { base: 1000, perKm: 450, perMin: 80 }
};

const SURCHARGES = {
  peakHour: 1.5,      // Heure de pointe (7h-9h, 17h-19h)
  night: 1.3,         // Nuit (22h-5h)
  rain: 1.2,          // Pluie
  highDemand: 1.4     // Forte demande
};

function getSurchargeMultiplier() {
  const hour = new Date().getHours();
  if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) {
    return SURCHARGES.peakHour;
  }
  if (hour >= 22 || hour <= 5) {
    return SURCHARGES.night;
  }
  return 1;
}

function calculatePrice(distance, duration, rideType) {
  const rates = RATES[rideType];
  if (!rates) return 0;

  const basePrice = rates.base;
  const distancePrice = distance * rates.perKm;
  const timePrice = duration * rates.perMin;
  const multiplier = getSurchargeMultiplier();

  let total = (basePrice + distancePrice + timePrice) * multiplier;

  // Arrondir à la centaine supérieure
  total = Math.ceil(total / 100) * 100;

  return total;
}

// Prix dégressif pour course partagée
function calculateSharedPrice(basePrice, passengerCount) {
  const discounts = {
    1: 0,      // 0% réduction
    2: 0.15,   // 15% réduction
    3: 0.25    // 25% réduction
  };

  const discount = discounts[passengerCount] || 0;
  const pricePerPassenger = basePrice * (1 - discount);

  return {
    total: basePrice,
    perPassenger: Math.ceil(pricePerPassenger / 100) * 100,
    discount: discount * 100 + '%'
  };
}

// Coefficient selon densité trafic (données Google Maps)
function getTrafficMultiplier(trafficLevel) {
  switch(trafficLevel) {
    case 'low': return 1.0;      // Trafic fluide
    case 'moderate': return 1.2; // Trafic modéré (+20%)
    case 'high': return 1.5;     // Embouteillage (+50%)
    case 'severe': return 2.0;   // Bouchon severe (+100%)
    default: return 1.0;
  }
}

// Prix final avec traffic
function calculatePriceWithTraffic(basePrice, distance, duration, rideType, trafficLevel) {
  const baseCalc = calculatePrice(distance, duration, rideType);
  const multiplier = getTrafficMultiplier(trafficLevel);

  return Math.ceil(baseCalc * multiplier / 100) * 100;
}


module.exports = { calculatePrice, RATES, SURCHARGES };
