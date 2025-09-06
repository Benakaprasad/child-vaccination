const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { USER_ROLES } = require('../utils/constants');

// Protect routes - Authentication middleware
const authMiddleware = async (req, res, next) => {
  try {
    let token;

    // Check for token in header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    // Check for token in cookies (if implementing cookie-based auth)
    else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: 'Access denied. No token provided.' 
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Get user from token
      const user = await User.findById(decoded.userId).select('+password');
      
      if (!user || !user.isActive) {
        return res.status(401).json({ 
          success: false,
          message: 'Invalid token or user not found.' 
        });
      }

      // Add user to request object
      req.user = user;
      next();

    } catch (error) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid token.' 
      });
    }
  } catch (error) {
    return res.status(500).json({ 
      success: false,
      message: 'Server error in authentication',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Role-based access control middleware
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        message: 'Authentication required' 
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false,
        message: 'Access denied. Insufficient permissions.',
        required: roles,
        current: req.user.role
      });
    }

    next();
  };
};

// Admin only middleware
const requireAdmin = requireRole(USER_ROLES.ADMIN);

// Doctor or Admin middleware
const requireDoctorOrAdmin = requireRole(USER_ROLES.DOCTOR, USER_ROLES.ADMIN);

// Parent access middleware (can only access own children)
const requireParentAccess = async (req, res, next) => {
  try {
    if (req.user.role === USER_ROLES.ADMIN || req.user.role === USER_ROLES.DOCTOR) {
      return next(); // Admins and doctors have access to all
    }

    if (req.user.role === USER_ROLES.PARENT) {
      // For parent role, they can only access their own children
      const childId = req.params.childId || req.params.id || req.body.childId;
      
      if (childId) {
        const Child = require('../models/Child');
        const child = await Child.findById(childId);
        
        if (!child) {
          return res.status(404).json({ 
            success: false,
            message: 'Child not found' 
          });
        }

        if (child.parentId.toString() !== req.user._id.toString()) {
          return res.status(403).json({ 
            success: false,
            message: 'Access denied. You can only access your own children.' 
          });
        }
      }
      
      return next();
    }

    return res.status(403).json({ 
      success: false,
      message: 'Access denied.' 
    });

  } catch (error) {
    return res.status(500).json({ 
      success: false,
      message: 'Server error in access control',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Optional auth middleware (doesn't require authentication but adds user if token is present)
const optionalAuth = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);
        
        if (user && user.isActive) {
          req.user = user;
        }
      } catch (error) {
        // Token is invalid, but we continue without user
        console.log('Optional auth: Invalid token provided');
      }
    }

    next();
  } catch (error) {
    next(); // Continue without authentication
  }
};

// Middleware to check if user owns resource
const checkResourceOwnership = (modelName, paramName = 'id', userField = 'userId') => {
  return async (req, res, next) => {
    try {
      // Admin and doctors can access all resources
      if (req.user.role === USER_ROLES.ADMIN || req.user.role === USER_ROLES.DOCTOR) {
        return next();
      }

      const Model = require(`../models/${modelName}`);
      const resourceId = req.params[paramName];
      
      const resource = await Model.findById(resourceId);
      
      if (!resource) {
        return res.status(404).json({ 
          success: false,
          message: `${modelName} not found` 
        });
      }

      // Check ownership
      const ownerId = resource[userField];
      if (ownerId && ownerId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ 
          success: false,
          message: 'Access denied. You can only access your own resources.' 
        });
      }

      // Store resource in request for potential use in controller
      req.resource = resource;
      next();

    } catch (error) {
      return res.status(500).json({ 
        success: false,
        message: 'Server error in ownership check',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  };
};

// Rate limiting for sensitive operations
const sensitiveOperationLimit = (windowMs = 15 * 60 * 1000, max = 5) => {
  const rateLimit = require('express-rate-limit');
  
  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      message: 'Too many attempts. Please try again later.',
      retryAfter: Math.ceil(windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

module.exports = {
  auth: authMiddleware, // Add this alias
  authMiddleware,
  requireRole,
  requireAdmin,
  requireDoctorOrAdmin,
  requireParentAccess,
  optionalAuth,
  checkResourceOwnership,
  sensitiveOperationLimit
};