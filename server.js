const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const compression = require('compression');
const cron = require('node-cron');
const path = require('path');
require('dotenv').config();

const app = express();

// Import middlewares
const errorHandler = require('./middleware/errorHandler');
const auth = require('./middleware/auth');
const { validateRequest } = require('./middleware/validation');

// Import utils
const logger = require('./utils/logger');
const { USER_ROLES } = require('./utils/constants');
const validators = require('./utils/validators');
const helpers = require('./utils/helpers');

// Import models
const User = require('./models/User');
const Child = require('./models/Child');
const Vaccine = require('./models/Vaccine');
const VaccinationRecord = require('./models/VaccinationRecord');
const Notification = require('./models/Notification');

// Import controllers
const authController = require('./controllers/authController');
const userController = require('./controllers/userController');
const childController = require('./controllers/childController');
const vaccineController = require('./controllers/vaccineController');
const vaccinationRecordController = require('./controllers/vaccinationRecordController');
const notificationController = require('./controllers/notificationController');

// Import services
const notificationService = require('./services/notificationService');
const emailService = require('./services/emailService');
const smsService = require('./services/smsService');
const vaccinationScheduler = require('./services/vaccinationScheduler');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const childrenRoutes = require('./routes/children');
const vaccineRoutes = require('./routes/vaccines');
const vaccinationRecordRoutes = require('./routes/vaccinationRecords');
const notificationRoutes = require('./routes/notifications');

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));

// Compression middleware
app.use(compression());

// Logging middleware
app.use(morgan('combined', { 
  stream: { 
    write: message => logger.info(message.trim()) 
  } 
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  }
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/child_vaccination')
.then(() => {
  logger.info('Connected to MongoDB');
  console.log('Connected to MongoDB');
})
.catch(err => {
  logger.error('MongoDB connection error:', err);
  console.error('MongoDB connection error:', err);
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
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Child Vaccination Tracking API',
    version: '1.0.0',
    status: 'Running',
    documentation: '/api/health',
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
  console.log('Running scheduled notification check...');
  try {
    notificationService.checkAndSendReminders();
  } catch (error) {
    logger.error('Error in scheduled notification check:', error);
  }
});

// Schedule overdue vaccination check daily at 9 AM
cron.schedule('0 9 * * *', () => {
  logger.info('Running overdue vaccination check...');
  console.log('Running overdue vaccination check...');
  try {
    notificationService.createOverdueNotifications();
  } catch (error) {
    logger.error('Error in overdue vaccination check:', error);
  }
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  mongoose.connection.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  mongoose.connection.close();
  process.exit(0);
});

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  console.log(`Child Vaccination API running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Access API at: http://localhost:${PORT}`);
});