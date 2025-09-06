console.log('=== SERVER STARTUP DEBUG ===');
console.log('1. Starting server initialization...');

// Load environment variables first
console.log('2. Loading environment variables...');
require('dotenv').config();
console.log('3. Environment loaded, NODE_ENV:', process.env.NODE_ENV);

// Core dependencies
console.log('4. Loading core dependencies...');
const express = require('express');
console.log('   ✓ Express loaded');
const mongoose = require('mongoose');
console.log('   ✓ Mongoose loaded');
const cors = require('cors');
console.log('   ✓ CORS loaded');
const helmet = require('helmet');
console.log('   ✓ Helmet loaded');
const rateLimit = require('express-rate-limit');
console.log('   ✓ Rate limit loaded');
const path = require('path');
console.log('   ✓ Path loaded');

// Optional dependencies with error handling
console.log('5. Loading optional dependencies...');
let morgan, compression, cron;

try {
  morgan = require('morgan');
  console.log('   ✓ Morgan loaded');
} catch (err) {
  console.log('   ✗ Morgan failed:', err.message);
}

try {
  compression = require('compression');
  console.log('   ✓ Compression loaded');
} catch (err) {
  console.log('   ✗ Compression failed:', err.message);
}

try {
  cron = require('node-cron');
  console.log('   ✓ Node-cron loaded');
} catch (err) {
  console.log('   ✗ Node-cron failed:', err.message);
}

const app = express();
console.log('6. Express app created');

// Import custom modules with error handling
console.log('7. Loading custom middleware...');

let errorHandler, loggerModule, auth, validateRequest;

try {
  const errorHandlerModule = require('./middleware/errorHandler');
  errorHandler = errorHandlerModule.errorHandler;
  console.log('   ✓ Error handler loaded');
} catch (err) {
  console.log('   ✗ Error handler failed:', err.message);
  errorHandler = (err, req, res, next) => {
    console.error('Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  };
}

try {
  // FIX: Import the entire logger module first
  loggerModule = require('./utils/logger');
  console.log('   ✓ Logger loaded');
} catch (err) {
  console.log('   ✗ Logger failed:', err.message);
  loggerModule = {
    logger: {
      info: (msg, meta) => console.log('INFO:', msg),
      error: (msg, meta) => console.error('ERROR:', msg),
      warn: (msg, meta) => console.warn('WARN:', msg)
    }
  };
}

// Extract logger from module
const logger = loggerModule.logger || loggerModule;

try {
  auth = require('./middleware/auth');
  console.log('   ✓ Auth middleware loaded');
} catch (err) {
  console.log('   ✗ Auth middleware failed:', err.message);
}

try {
  // FIX: Import validateRequest correctly
  const validationModule = require('./middleware/validation');
  validateRequest = validationModule.validateRequest || validationModule.handleValidationErrors;
  console.log('   ✓ Validation middleware loaded');
} catch (err) {
  console.log('   ✗ Validation middleware failed:', err.message);
}

// Import utils with error handling
console.log('8. Loading utilities...');

let USER_ROLES, validators, helpers;

try {
  const constants = require('./utils/constants');
  USER_ROLES = constants.USER_ROLES;
  console.log('   ✓ Constants loaded');
} catch (err) {
  console.log('   ✗ Constants failed:', err.message);
}

try {
  validators = require('./utils/validators');
  console.log('   ✓ Validators loaded');
} catch (err) {
  console.log('   ✗ Validators failed:', err.message);
}

try {
  helpers = require('./utils/helpers');
  console.log('   ✓ Helpers loaded');
} catch (err) {
  console.log('   ✗ Helpers failed:', err.message);
}

// Import models with error handling
console.log('9. Loading models...');

let User, Child, Vaccine, VaccinationRecord, Notification;

try {
  User = require('./models/User');
  console.log('   ✓ User model loaded');
} catch (err) {
  console.log('   ✗ User model failed:', err.message);
}

try {
  Child = require('./models/Child');
  console.log('   ✓ Child model loaded');
} catch (err) {
  console.log('   ✗ Child model failed:', err.message);
}

try {
  Vaccine = require('./models/Vaccine');
  console.log('   ✓ Vaccine model loaded');
} catch (err) {
  console.log('   ✗ Vaccine model failed:', err.message);
}

try {
  // FIX: Clear any cached model before requiring
  delete require.cache[require.resolve('./models/VaccinationRecord')];
  VaccinationRecord = require('./models/VaccinationRecord');
  console.log('   ✓ VaccinationRecord model loaded');
} catch (err) {
  console.log('   ✗ VaccinationRecord model failed:', err.message);
}

try {
  Notification = require('./models/Notification');
  console.log('   ✓ Notification model loaded');
} catch (err) {
  console.log('   ✗ Notification model failed:', err.message);
}

// Import controllers with error handling
console.log('10. Loading controllers...');

let authController, userController, childController, vaccineController, vaccinationRecordController, notificationController;

try {
  authController = require('./controllers/authController');
  console.log('   ✓ Auth controller loaded');
} catch (err) {
  console.log('   ✗ Auth controller failed:', err.message);
}

try {
  userController = require('./controllers/userController');
  console.log('   ✓ User controller loaded');
} catch (err) {
  console.log('   ✗ User controller failed:', err.message);
}

try {
  childController = require('./controllers/childController');
  console.log('   ✓ Child controller loaded');
} catch (err) {
  console.log('   ✗ Child controller failed:', err.message);
}

try {
  vaccineController = require('./controllers/vaccineController');
  console.log('   ✓ Vaccine controller loaded');
} catch (err) {
  console.log('   ✗ Vaccine controller failed:', err.message);
}

try {
  vaccinationRecordController = require('./controllers/vaccinationRecordController');
  console.log('   ✓ VaccinationRecord controller loaded');
} catch (err) {
  console.log('   ✗ VaccinationRecord controller failed:', err.message);
}

try {
  notificationController = require('./controllers/notificationController');
  console.log('   ✓ Notification controller loaded');
} catch (err) {
  console.log('   ✗ Notification controller failed:', err.message);
}

// Import services with error handling
console.log('11. Loading services...');

let notificationService, emailService, smsService, vaccinationScheduler;

try {
  notificationService = require('./services/notificationService');
  console.log('   ✓ Notification service loaded');
} catch (err) {
  console.log('   ✗ Notification service failed:', err.message);
  notificationService = {
    checkAndSendReminders: () => console.log('Notification service placeholder - checkAndSendReminders'),
    createOverdueNotifications: () => console.log('Notification service placeholder - createOverdueNotifications')
  };
}

try {
  emailService = require('./services/emailService');
  console.log('   ✓ Email service loaded');
} catch (err) {
  console.log('   ✗ Email service failed:', err.message);
}

try {
  smsService = require('./services/smsService');
  console.log('   ✓ SMS service loaded');
} catch (err) {
  console.log('   ✗ SMS service failed:', err.message);
}

try {
  vaccinationScheduler = require('./services/vaccinationScheduler');
  console.log('   ✓ Vaccination scheduler loaded');
} catch (err) {
  console.log('   ✗ Vaccination scheduler failed:', err.message);
}

// Import routes with error handling
console.log('12. Loading routes...');

let authRoutes, userRoutes, childrenRoutes, vaccineRoutes, vaccinationRecordRoutes, notificationRoutes;

try {
  authRoutes = require('./routes/auth');
  console.log('   ✓ Auth routes loaded');
} catch (err) {
  console.log('   ✗ Auth routes failed:', err.message);
}

try {
  userRoutes = require('./routes/users');
  console.log('   ✓ User routes loaded');
} catch (err) {
  console.log('   ✗ User routes failed:', err.message);
}

try {
  childrenRoutes = require('./routes/children');
  console.log('   ✓ Children routes loaded');
} catch (err) {
  console.log('   ✗ Children routes failed:', err.message);
}

try {
  vaccineRoutes = require('./routes/vaccines');
  console.log('   ✓ Vaccine routes loaded');
} catch (err) {
  console.log('   ✗ Vaccine routes failed:', err.message);
}

try {
  vaccinationRecordRoutes = require('./routes/vaccinationRecords');
  console.log('   ✓ Vaccination record routes loaded');
} catch (err) {
  console.log('   ✗ Vaccination record routes failed:', err.message);
}

try {
  notificationRoutes = require('./routes/notifications');
  console.log('   ✓ Notification routes loaded');
} catch (err) {
  console.log('   ✗ Notification routes failed:', err.message);
}

console.log('13. Setting up middleware...');

// Security middleware
app.use(helmet());
console.log('   ✓ Helmet configured');

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
console.log('   ✓ CORS configured');

// Optional middleware
if (compression) {
  app.use(compression());
  console.log('   ✓ Compression enabled');
}

// FIX: Better morgan integration with proper logger stream
if (morgan && logger) {
  const loggerStream = {
    write: function(message) {
      // Remove trailing newline and log
      logger.info(message.trim());
    }
  };
  app.use(morgan('combined', { stream: loggerStream }));
  console.log('   ✓ Morgan logging enabled');
}

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  }
});
app.use(limiter);
console.log('   ✓ Rate limiting configured');

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
console.log('   ✓ Body parsing configured');

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
console.log('   ✓ Static files configured');

console.log('14. Connecting to MongoDB...');
console.log('   Connection string:', process.env.MONGODB_URI || 'mongodb://localhost:27017/child_vaccination');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/child_vaccination')
.then(() => {
  logger.info('Connected to MongoDB');
  console.log('   ✓ MongoDB connected successfully');
})
.catch(err => {
  logger.error('MongoDB connection error:', err);
  console.log('   ✗ MongoDB connection failed:', err.message);
  console.log('   Note: Server will continue without database connection');
});

console.log('15. Setting up routes...');

// Health check endpoint (define early)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  });
});
console.log('   ✓ Health check route configured');

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
console.log('   ✓ Root endpoint configured');

// Routes (only if they loaded successfully)
if (authRoutes) {
  app.use('/api/auth', authRoutes);
  console.log('   ✓ Auth routes mounted');
}

if (userRoutes) {
  app.use('/api/users', userRoutes);
  console.log('   ✓ User routes mounted');
}

if (childrenRoutes) {
  app.use('/api/children', childrenRoutes);
  console.log('   ✓ Children routes mounted');
}

if (vaccineRoutes) {
  app.use('/api/vaccines', vaccineRoutes);
  console.log('   ✓ Vaccine routes mounted');
}

if (vaccinationRecordRoutes) {
  app.use('/api/vaccination-records', vaccinationRecordRoutes);
  console.log('   ✓ Vaccination record routes mounted');
}

if (notificationRoutes) {
  app.use('/api/notifications', notificationRoutes);
  console.log('   ✓ Notification routes mounted');
}

// Schedule cron jobs if cron is available
if (cron && notificationService) {
  console.log('16. Setting up cron jobs...');
  
  try {
    cron.schedule('0 * * * *', () => {
      logger.info('Running scheduled notification check...');
      console.log('Running scheduled notification check...');
      try {
        notificationService.checkAndSendReminders();
      } catch (error) {
        logger.error('Error in scheduled notification check:', error);
      }
    });
    console.log('   ✓ Hourly notification check scheduled');
  } catch (err) {
    console.log('   ✗ Failed to schedule hourly notifications:', err.message);
  }

  try {
    cron.schedule('0 9 * * *', () => {
      logger.info('Running overdue vaccination check...');
      console.log('Running overdue vaccination check...');
      try {
        notificationService.createOverdueNotifications();
      } catch (error) {
        logger.error('Error in overdue vaccination check:', error);
      }
    });
    console.log('   ✓ Daily overdue check scheduled');
  } catch (err) {
    console.log('   ✗ Failed to schedule daily overdue check:', err.message);
  }
} else {
  console.log('16. Cron jobs skipped (cron or notification service not available)');
}

// Graceful shutdown handling
console.log('17. Setting up graceful shutdown...');
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  console.log('SIGTERM received, shutting down gracefully');
  mongoose.connection.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  console.log('SIGINT received, shutting down gracefully');
  mongoose.connection.close();
  process.exit(0);
});

// Error handling middleware
if (errorHandler) {
  app.use(errorHandler);
  console.log('   ✓ Error handler configured');
}

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});
console.log('   ✓ 404 handler configured');

console.log('18. Starting server...');
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('=== SERVER STARTED SUCCESSFULLY ===');
  logger.info(`Server running on port ${PORT}`);
  console.log(`Child Vaccination API running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Access API at: http://localhost:${PORT}`);
  console.log('=====================================');
});