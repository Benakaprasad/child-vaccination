const express = require('express');
const multer = require('multer');
const path = require('path');
const userController = require('../controllers/userController');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const { userUpdateSchema, paginationSchema } = require('../utils/validators');
const { USER_ROLES, FILE_UPLOAD } = require('../utils/constants');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, FILE_UPLOAD.PROFILE_PATH);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  if (FILE_UPLOAD.ALLOWED_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and PDF files are allowed.'), false);
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: FILE_UPLOAD.MAX_SIZE // 5MB
  },
  fileFilter
});

/**
 * @route   GET /api/users
 * @desc    Get all users (Admin only)
 * @access  Private - Admin
 */
router.get(
  '/',
  auth,
  requireRole([USER_ROLES.ADMIN]),
  validateRequest(paginationSchema, 'query'),
  userController.getAllUsers
);

/**
 * @route   GET /api/users/dashboard
 * @desc    Get user dashboard data
 * @access  Private
 */
router.get(
  '/dashboard',
  auth,
  userController.getDashboard
);

/**
 * @route   GET /api/users/statistics
 * @desc    Get user statistics (Admin only)
 * @access  Private - Admin
 */
router.get(
  '/statistics',
  auth,
  requireRole([USER_ROLES.ADMIN]),
  userController.getUserStatistics
);

/**
 * @route   GET /api/users/search
 * @desc    Search users
 * @access  Private - Admin/Doctor
 */
router.get(
  '/search',
  auth,
  requireRole([USER_ROLES.ADMIN, USER_ROLES.DOCTOR]),
  validateRequest({
    query: {
      q: {
        type: 'string',
        required: true,
        minLength: 2
      },
      role: {
        type: 'string',
        enum: Object.values(USER_ROLES),
        optional: true
      },
      limit: {
        type: 'number',
        min: 1,
        max: 50,
        optional: true
      }
    }
  }),
  userController.searchUsers
);

/**
 * @route   GET /api/users/role/:role
 * @desc    Get users by role
 * @access  Private - Admin/Doctor
 */
router.get(
  '/role/:role',
  auth,
  requireRole([USER_ROLES.ADMIN, USER_ROLES.DOCTOR]),
  validateRequest({
    params: {
      role: {
        type: 'string',
        enum: Object.values(USER_ROLES),
        required: true
      }
    },
    query: {
      page: {
        type: 'number',
        min: 1,
        optional: true
      },
      limit: {
        type: 'number',
        min: 1,
        max: 100,
        optional: true
      },
      isActive: {
        type: 'boolean',
        optional: true
      }
    }
  }),
  userController.getUsersByRole
);

/**
 * @route   GET /api/users/export
 * @desc    Export users data (Admin only)
 * @access  Private - Admin
 */
router.get(
  '/export',
  auth,
  requireRole([USER_ROLES.ADMIN]),
  validateRequest({
    query: {
      format: {
        type: 'string',
        enum: ['json', 'csv'],
        optional: true
      },
      role: {
        type: 'string',
        enum: Object.values(USER_ROLES),
        optional: true
      },
      isActive: {
        type: 'boolean',
        optional: true
      }
    }
  }),
  userController.exportUsers
);

/**
 * @route   PUT /api/users/preferences
 * @desc    Update user preferences
 * @access  Private
 */
router.put(
  '/preferences',
  auth,
  validateRequest({
    body: {
      preferences: {
        type: 'object',
        required: true,
        properties: {
          notifications: {
            type: 'object',
            properties: {
              email: { type: 'boolean' },
              sms: { type: 'boolean' },
              push: { type: 'boolean' }
            }
          },
          reminderTiming: {
            type: 'number',
            min: 1,
            max: 30
          }
        }
      }
    }
  }),
  userController.updatePreferences
);

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID
 * @access  Private (Own profile or Admin)
 */
router.get(
  '/:id',
  auth,
  validateRequest({
    params: {
      id: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
        required: true
      }
    }
  }),
  userController.getUserById
);

/**
 * @route   PUT /api/users/:id
 * @desc    Update user
 * @access  Private (Own profile or Admin)
 */
router.put(
  '/:id',
  auth,
  validateRequest({
    params: {
      id: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
        required: true
      }
    }
  }),
  validateRequest(userUpdateSchema),
  userController.updateUser
);

/**
 * @route   DELETE /api/users/:id
 * @desc    Delete user (Admin only)
 * @access  Private - Admin
 */
router.delete(
  '/:id',
  auth,
  requireRole([USER_ROLES.ADMIN]),
  validateRequest({
    params: {
      id: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
        required: true
      }
    }
  }),
  userController.deleteUser
);

/**
 * @route   POST /api/users/:id/upload-image
 * @desc    Upload user profile image
 * @access  Private (Own profile or Admin)
 */
router.post(
  '/:id/upload-image',
  auth,
  validateRequest({
    params: {
      id: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
        required: true
      }
    }
  }),
  upload.single('profileImage'),
  userController.uploadProfileImage
);

/**
 * @route   GET /api/users/:id/activity
 * @desc    Get user activity log (Admin only)
 * @access  Private - Admin
 */
router.get(
  '/:id/activity',
  auth,
  requireRole([USER_ROLES.ADMIN]),
  validateRequest({
    params: {
      id: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
        required: true
      }
    },
    query: {
      page: {
        type: 'number',
        min: 1,
        optional: true
      },
      limit: {
        type: 'number',
        min: 1,
        max: 100,
        optional: true
      },
      startDate: {
        type: 'string',
        format: 'date',
        optional: true
      },
      endDate: {
        type: 'string',
        format: 'date',
        optional: true
      }
    }
  }),
  userController.getUserActivity
);

/**
 * @route   PATCH /api/users/:id/toggle-status
 * @desc    Activate/Deactivate user (Admin only)
 * @access  Private - Admin
 */
router.patch(
  '/:id/toggle-status',
  auth,
  requireRole([USER_ROLES.ADMIN]),
  validateRequest({
    params: {
      id: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
        required: true
      }
    },
    body: {
      isActive: {
        type: 'boolean',
        required: true
      }
    }
  }),
  userController.toggleUserStatus
);

// Error handling middleware for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum size allowed is 5MB.'
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected field name. Please use "profileImage" as the field name.'
      });
    }
  }
  
  if (error.message.includes('Invalid file type')) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
  
  next(error);
});

module.exports = router;