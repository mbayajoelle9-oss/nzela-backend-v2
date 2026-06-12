// Obtenir véhicules disponibles pour un événement
const getAvailableVehicles = async (req, res) => {
  const { eventType, date } = req.query;

  const vehicles = await VehicleRental.find({
    eventType,
'availability.isAvailable': true,
'availability.availableDates': { $not: { $in: [new Date(date)] } }
  });

  res.json({ success: true, vehicles });
};

// Confirmer une location
const confirmRental = async (req, res) => {
  const { vehicleId, rentalDate, duration, customerInfo } = req.body;

  // Marquer véhicule comme réservé
  await VehicleRental.findByIdAndUpdate(vehicleId, {
    $push: { 'availability.availableDates': new Date(rentalDate) }
  });

  // Créer réservation
  const booking = new RentalBooking({
    vehicleId,
    customerId: req.userId,
    rentalDate,
    duration,
    status: 'confirmed'
  });

  await booking.save();

  res.json({ success: true, booking });
};
