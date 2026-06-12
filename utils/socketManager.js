let io;

const initSocket = (server) => {
  const socketIo = require('socket.io');
  io = socketIo(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    console.log('🔌 Nouveau client connecté:', socket.id);

    socket.on('disconnect', () => {
      console.log('🔌 Client déconnecté:', socket.id);
    });
  });

  return io;
};

const getIo = () => {
  if (!io) {
    throw new Error('Socket.io non initialisé');
  }
  return io;
};

module.exports = { initSocket, getIo };
