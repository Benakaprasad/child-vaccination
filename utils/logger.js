const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack }) => {
    return `${timestamp} [${level}]: ${stack || message}`;
  })
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: fileFormat,
  defaultMeta: { 
    service: 'child-vaccination-api',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Error logs
    new winston.transports.File({ 
      filename: path.join(logsDir, 'error.log'), 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    }),
    
    // Combined logs
    new winston.transports.File({ 
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    }),
    
    // Application logs
    new winston.transports.File({ 
      filename: path.join(logsDir, 'app.log'),
      level: 'info',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    })
  ],
  
  // Handle uncaught exceptions and rejections
  exceptionHandlers: [
    new winston.transports.File({ filename: path.join(logsDir, 'exceptions.log') })
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: path.join(logsDir, 'rejections.log') })
  ]
});

// Add console transport for development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    level: 'debug'
  }));
}

// Create child loggers for specific modules
const createChildLogger = (module) => {
  return logger.child({ module });
};

// Custom logging methods
const logAPI = (method, url, statusCode, responseTime, userId = null) => {
  logger.info('API Request', {
    method,
    url,
    statusCode,
    responseTime: `${responseTime}ms`,
    userId,
    type: 'api'
  });
};

const logAuth = (action, userId, email, success, ip = null) => {
  logger.info('Authentication', {
    action,
    userId,
    email,
    success,
    ip,
    type: 'auth'
  });
};

const logDatabase = (operation, collection, documentId = null, success = true, error = null) => {
  const logData = {
    operation,
    collection,
    documentId,
    success,
    type: 'database'
  };
  
  if (error) {
    logData.error = error.message;
    logger.error('Database Operation Failed', logData);
  } else {
    logger.info('Database Operation', logData);
  }
};

const logNotification = (type, userId, deliveryType, success, error = null) => {
  const logData = {
    notificationType: type,
    userId,
    deliveryType,
    success,
    type: 'notification'
  };
  
  if (error) {
    logData.error = error.message;
    logger.error('Notification Failed', logData);
  } else {
    logger.info('Notification Sent', logData);
  }
};

const logSecurity = (event, userId = null, ip = null, details = null) => {
  logger.warn('Security Event', {
    event,
    userId,
    ip,
    details,
    type: 'security'
  });
};

const logPerformance = (operation, duration, details = null) => {
  logger.info('Performance Metric', {
    operation,
    duration: `${duration}ms`,
    details,
    type: 'performance'
  });
};

const logBusinessRule = (rule, childId, vaccineId, result, details = null) => {
  logger.info('Business Rule Evaluation', {
    rule,
    childId,
    vaccineId,
    result,
    details,
    type: 'business'
  });
};

// Stream for morgan HTTP request logging
logger.stream = {
  write: function(message) {
    logger.info(message.trim());
  }
};

module.exports = {
  logger,
  createChildLogger,
  logAPI,
  logAuth,
  logDatabase,
  logNotification,
  logSecurity,
  logPerformance,
  logBusinessRule
};