const express = require('express');
const http = require('http');
const cors = require('cors');
const dotenv = require('dotenv');
const passport = require('passport');
const connectDB = require('./config/database');
const { errorHandler, notFound } = require('./middleware/errorMiddleware');
const { initSocket } = require('./utils/socketManager');
const rideSocket = require('./sockets/rideSocket');

dotenv.config();
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

connectDB();

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Passport (initialisation)
require('./config/passportSocial')(passport);
app.use(passport.initialize());

// ============================================================
// Routes
// ============================================================
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/rides', require('./routes/rideRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/drivers', require('./routes/driverRoutes'));

// ✅ NOUVEAU : routes suggestions + transport de biens
app.use('/api/suggestions', require('./routes/suggestionRoutes'));
app.use('/api/goods', require('./routes/goodsRoutes'));


// ✅ ADMIN : dashboard, stats, users, drivers, rides, goods (admin uniquement)
app.use('/api/admin', require('./routes/adminRoutes'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Gestion erreurs
app.use(notFound);
app.use(errorHandler);

// Socket.io
const io = initSocket(server);
rideSocket(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Serveur Ekomi démarré sur le port ${PORT}`);
  console.log(`   Environnement: ${process.env.NODE_ENV || 'development'}`);
});
