const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const { auth, requireRole } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const { 
  userRegistrationSchema,
  userLoginSchema,
  userUpdateSchema
} = require('../utils/validators');

function debugMiddleware(req, res, next) {
  console.log('Middleware called, next is', typeof next);
  next();
}
router.use(debugMiddleware);
// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000, // 15 minutes
  max: process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || 5, // limit each IP to 5 requests per windowMs
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later',
    retryAfter: Math.ceil((process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000) / 1000 / 60)
  },
  standardHeaders: true,
  legacyHeaders: false
});

// More lenient rate limiting for general auth endpoints
const generalAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post(
  '/register',
  authLimiter,
  validateRequest(userRegistrationSchema),
  authController.register
);

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post(
  '/login',
  authLimiter,
  validateRequest(userLoginSchema),
  authController.login
);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get(
  '/me',
  generalAuthLimiter,
  auth,
  authController.getProfile
);

/**
 * @route   PUT /api/auth/profile
 * @desc    Update current user profile
 * @access  Private
 */
router.put(
  '/profile',
  generalAuthLimiter,
  auth,
  validateRequest(userUpdateSchema),
  authController.updateProfile
);

/**
 * @route   POST /api/auth/change-password
 * @desc    Change user password
 * @access  Private
 */
router.post(
  '/change-password',
  authLimiter,
  auth,
  validateRequest({
    body: {
      currentPassword: {
        type: 'string',
        required: true,
        minLength: 1
      },
      newPassword: {
        type: 'string',
        required: true,
        minLength: 8,
        pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#\\$%\\^&\\*])'
      }
    }
  }),
  authController.changePassword
);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Request password reset
 * @access  Public
 */
router.post(
  '/forgot-password',
  authLimiter,
  validateRequest({
    body: {
      email: {
        type: 'string',
        required: true,
        format: 'email'
      }
    }
  }),
  authController.forgotPassword
);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reset password with token
 * @access  Public
 */
router.post(
  '/reset-password',
  authLimiter,
  validateRequest({
    body: {
      token: {
        type: 'string',
        required: true,
        minLength: 1
      },
      newPassword: {
        type: 'string',
        required: true,
        minLength: 8,
        pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#\\$%\\^&\\*])'
      }
    }
  }),
  authController.resetPassword
);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (client-side token removal)
 * @access  Private
 */
router.post(
  '/logout',
  generalAuthLimiter,
  auth,
  authController.logout
);

/**
 * @route   GET /api/auth/verify-email/:token
 * @desc    Verify email address
 * @access  Public
 */
router.get(
  '/verify-email/:token',
  generalAuthLimiter,
  validateRequest({
    params: {
      token: {
        type: 'string',
        required: true,
        minLength: 1
      }
    }
  }),
  authController.verifyEmail
);

/**
 * @route   POST /api/auth/refresh-token
 * @desc    Refresh JWT token
 * @access  Private
 */
router.post(
  '/refresh-token',
  generalAuthLimiter,
  auth,
  authController.refreshToken
);

/**
 * @route   POST /api/auth/deactivate-account
 * @desc    Deactivate user account
 * @access  Private
 */
router.post(
  '/deactivate-account',
  authLimiter,
  auth,
  validateRequest({
    body: {
      password: {
        type: 'string',
        required: true,
        minLength: 1
      }
    }
  }),
  authController.deactivateAccount
);

module.exports = router;