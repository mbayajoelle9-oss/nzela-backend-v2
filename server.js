const express = require('express');
const http = require('http');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/database');
const { errorHandler, notFound } = require('./middleware/errorMiddleware');
const { initSocket } = require('./utils/socketManager');
const rideSocket = require('./sockets/rideSocket');

dotenv.config();

// Ne charger .env que si on est en développement (pas sur Render)
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

// Connexion DB
connectDB();

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/rides', require('./routes/rideRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/drivers', require('./routes/driverRoutes'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Gestion erreurs (ordre important)
app.use(notFound);
app.use(errorHandler);

// Socket.io
const io = initSocket(server);
rideSocket(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
});




