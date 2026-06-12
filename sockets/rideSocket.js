module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('🔌 Client connecté:', socket.id);

    // Rejoindre une room de course
    socket.on('join-ride', (rideId) => {
      socket.join(`ride_${rideId}`);
      console.log(`Client ${socket.id} a rejoint la course ${rideId}`);
    });

    // Quitter une room
    socket.on('leave-ride', (rideId) => {
      socket.leave(`ride_${rideId}`);
      console.log(`Client ${socket.id} a quitté la course ${rideId}`);
    });

    // Mise à jour position chauffeur
    socket.on('driver-location', (data) => {
      const { rideId, location } = data;
      io.to(`ride_${rideId}`).emit('location-update', {
        driverLocation: location,
        timestamp: new Date()
      });
    });

    // Démarrer course
    socket.on('start-ride', (rideId) => {
      io.to(`ride_${rideId}`).emit('ride-started', {
        message: 'La course a commencé',
        timestamp: new Date()
      });
    });

    // Terminer course
    socket.on('complete-ride', (rideId) => {
      io.to(`ride_${rideId}`).emit('ride-completed', {
        message: 'La course est terminée',
        timestamp: new Date()
      });
    });

    // Alerte SOS
    socket.on('sos-alert', (data) => {
      const { rideId, userId, location } = data;
      io.to(`ride_${rideId}`).emit('sos-triggered', {
        userId,
        location,
        message: '🚨 ALERTE SOS - Assistance requise',
        timestamp: new Date()
      });
      console.log(`🚨 SOS déclenché pour course ${rideId} par ${userId}`);
    });

    socket.on('disconnect', () => {
      console.log('🔌 Client déconnecté:', socket.id);
    });
  });
};
