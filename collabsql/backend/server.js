const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const databaseRoutes = require('./routes/database');
const queryRoutes = require('./routes/query');
const collaborationRoutes = require('./routes/collaboration');
const historyRoutes = require('./routes/history');

// Import socket handler
const socketHandler = require('./socket/socketHandler');

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');
const dbManager = require('./config/database');

const app = express();
const server = http.createServer(app);

// Allow multiple origins (e.g. frontend on 3000 or 3001)
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:3001')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const io = socketIo(server, {
  cors: {
    origin: corsOrigins.length ? corsOrigins : true,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Security middleware
app.use(helmet());
app.use(cors({
  origin: corsOrigins.length ? corsOrigins : true,
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || 15) * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || 100),
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Create necessary directories
const fs = require('fs');
const uploadDir = process.env.UPLOAD_DIR || './uploads/databases';
const dataDir = './data';

[uploadDir, dataDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/database', databaseRoutes);
app.use('/api/query', queryRoutes);
app.use('/api/collaboration', collaborationRoutes);
app.use('/api/history', historyRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// Socket.io connection handling
socketHandler(io);

// Error handling middleware (must be last)
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 5000;

async function startServer() {
  if (!process.env.JWT_SECRET) {
    console.error('Fatal: JWT_SECRET is not set in .env. Auth will not work.');
    process.exit(1);
  }

  try {
    await dbManager.initializeSystemDb();
  } catch (err) {
    console.error('Fatal: Failed to initialize system database:', err);
    process.exit(1);
  }

  server.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════╗
║         CollabSQL Backend Server Running               ║
║                                                        ║
║  Port: ${PORT}                                           ║
║  Environment: ${process.env.NODE_ENV || 'development'}                              ║
║  API: http://localhost:${PORT}/api                      ║
║                                                        ║
║  Status: Ready to accept connections                   ║
╚════════════════════════════════════════════════════════╝
  `);
  });
}

startServer();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = { app, io };
