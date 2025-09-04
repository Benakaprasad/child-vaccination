const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const path = require('path');
require('dotenv').config();

const app = express();

// Import middlewares
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const childrenRoutes = require('./routes/children');
const vaccineRoutes = require('./routes/vaccines');
const vaccinationRecordRoutes = require('./routes/vaccinationRecords');
const notificationRoutes = require('./routes/notifications');

// Import services
const notificationService = require('./services/notificationService');

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/child_vaccination', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  logger.info('Connected to MongoDB');
  console.log('✅ Connected to MongoDB');
})
.catch(err => {
  logger.error('MongoDB connection error:', err);
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/children', childrenRoutes);
app.use('/api/vaccines', vaccineRoutes);
app.use('/api/vaccination-records', vaccinationRecordRoutes);
app.use('/api/notifications', notificationRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Child Vaccination Tracking API',
    version: '1.0.0',
    status: 'Running',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      users: '/api/users',
      children: '/api/children',
      vaccines: '/api/vaccines',
      vaccinationRecords: '/api/vaccination-records',
      notifications: '/api/notifications'
    }
  });
});

// Schedule notification check every hour
cron.schedule('0 * * * *', () => {
  logger.info('Running scheduled notification check...');
  console.log('🔔 Running scheduled notification check...');
  notificationService.checkAndSendReminders();
});

// Schedule overdue vaccination check daily at 9 AM
cron.schedule('0 9 * * *', () => {
  logger.info('Running overdue vaccination check...');
  console.log('⚠️ Running overdue vaccination check...');
  notificationService.createOverdueNotifications();
});

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    success: false,
    message: 'Route not found',
    path: req.originalUrl
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  console.log(`🚀 Child Vaccination API running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📱 Access API at: http://localhost:${PORT}`);
});