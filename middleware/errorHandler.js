// middleware/errorHandler.js - Updated for Winston logger
const { logger, logSecurity } = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error using Winston logger
  try {
    logger.error('Application Error', {
      message: err.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user ? req.user._id : null,
      statusCode: error.statusCode || 500,
      type: 'error'
    });
  } catch (logError) {
    // Fallback to console if logger fails
    console.error('Logger failed:', logError.message);
    console.error('Original Error:', {
      message: err.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method
    });
  }

  // Log security events for suspicious activities
  if (err.statusCode === 401 || err.statusCode === 403) {
    logSecurity('Unauthorized Access Attempt', req.user ? req.user._id : null, req.ip, {
      url: req.originalUrl,
      method: req.method,
      error: err.message
    });
  }

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = { message, statusCode: 404 };
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    const value = err.keyValue ? err.keyValue[field] : 'unknown';
    const message = `${field} '${value}' already exists`;
    error = { message, statusCode: 400 };
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = { message, statusCode: 400 };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = { message, statusCode: 401 };
    logSecurity('Invalid JWT Token', req.user ? req.user._id : null, req.ip, {
      token: req.headers.authorization,
      url: req.originalUrl
    });
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = { message, statusCode: 401 };
  }

  // Multer errors (file upload)
  if (err.code === 'LIMIT_FILE_SIZE') {
    const message = 'File too large';
    error = { message, statusCode: 400 };
  }

  if (err.code === 'LIMIT_FILE_COUNT') {
    const message = 'Too many files';
    error = { message, statusCode: 400 };
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    const message = 'Unexpected file field';
    error = { message, statusCode: 400 };
  }

  // MongoDB connection errors
  if (err.name === 'MongoNetworkError') {
    const message = 'Database connection error';
    error = { message, statusCode: 503 };
  }

  // Handle specific application errors
  if (err.name === 'AppError') {
    error = { message: err.message, statusCode: err.statusCode || 400 };
  }

  // Rate limiting errors
  if (err.status === 429) {
    const message = 'Too many requests, please try again later';
    error = { message, statusCode: 429 };
    logSecurity('Rate Limit Exceeded', req.user ? req.user._id : null, req.ip, {
      url: req.originalUrl,
      method: req.method
    });
  }

  // Default to 500 server error
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal Server Error';

  // Prepare error response
  const errorResponse = {
    success: false,
    error: message,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method,
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      details: err
    })
  };

  // Add additional context for specific errors
  if (statusCode === 404) {
    errorResponse.message = `Resource not found at ${req.originalUrl}`;
  }

  if (statusCode === 401) {
    errorResponse.message = 'Authentication required';
  }

  if (statusCode === 403) {
    errorResponse.message = 'Access forbidden';
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
};

// Custom error class for application-specific errors
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Async error handler wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// 404 handler for undefined routes
const notFound = (req, res, next) => {
  const error = new AppError(`Route ${req.originalUrl} not found`, 404);
  next(error);
};

// Helper for handling async route errors
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

// Global uncaught exception handler
const handleUncaughtException = () => {
  process.on('uncaughtException', (err) => {
    logger.error('UNCAUGHT EXCEPTION! Shutting down...', {
      name: err.name,
      message: err.message,
      stack: err.stack,
      type: 'uncaughtException'
    });
    process.exit(1);
  });
};

// Global unhandled rejection handler
const handleUnhandledRejection = () => {
  process.on('unhandledRejection', (err) => {
    logger.error('UNHANDLED REJECTION! Shutting down...', {
      name: err.name,
      message: err.message,
      stack: err.stack,
      type: 'unhandledRejection'
    });
    process.exit(1);
  });
};

module.exports = {
  errorHandler,
  AppError,
  asyncHandler,
  notFound,
  catchAsync,
  handleUncaughtException,
  handleUnhandledRejection
};