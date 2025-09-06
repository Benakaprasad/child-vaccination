const express = require('express');
const multer = require('multer');
const path = require('path');
const childController = require('../controllers/childController');
const { auth, requireRole } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const { childSchema, childUpdateSchema, paginationSchema } = require('../utils/validators');
const { USER_ROLES, FILE_UPLOAD, GENDER_OPTIONS } = require('../utils/constants');

const router = express.Router();

// Configure multer for child image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, FILE_UPLOAD.PROFILE_PATH);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'child-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  if (FILE_UPLOAD.ALLOWED_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF files are allowed for child images.'), false);
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
 * @route   GET /api/children
 * @desc    Get all children for current user or all children (Admin/Doctor)
 * @access  Private
 */
router.get(
  '/',
  auth,
  validateRequest({
    query: {
      parentId: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
        optional: true
      }
    }
  }),
  childController.getChildren
);

/**
 * @route   GET /api/children/search
 * @desc    Search children
 * @access  Private
 */
router.get(
  '/search',
  auth,
  validateRequest({
    query: {
      q: {
        type: 'string',
        required: true,
        minLength: 2
      },
      parentId: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
        optional: true
      },
      gender: {
        type: 'string',
        enum: Object.values(GENDER_OPTIONS),
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
  childController.searchChildren
);

/**
 * @route   GET /api/children/age-range
 * @desc    Get children by age range
 * @access  Private
 */
router.get(
  '/age-range',
  auth,
  validateRequest({
    query: {
      minAge: {
        type: 'number',
        min: 0,
        optional: true
      },
      maxAge: {
        type: 'number',
        min: 0,
        max: 25,
        optional: true
      },
      unit: {
        type: 'string',
        enum: ['days', 'months', 'years'],
        optional: true
      },
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
      }
    }
  }),
  childController.getChildrenByAgeRange
);

/**
 * @route   GET /api/children/upcoming-vaccinations
 * @desc    Get children with upcoming vaccinations
 * @access  Private
 */
router.get(
  '/upcoming-vaccinations',
  auth,
  validateRequest({
    query: {
      days: {
        type: 'number',
        min: 1,
        max: 365,
        optional: true
      }
    }
  }),
  childController.getChildrenWithUpcomingVaccinations
);

/**
 * @route   GET /api/children/overdue-vaccinations
 * @desc    Get children with overdue vaccinations
 * @access  Private
 */
router.get(
  '/overdue-vaccinations',
  auth,
  childController.getChildrenWithOverdueVaccinations
);

/**
 * @route   GET /api/children/export
 * @desc    Export children data (Admin/Doctor only)
 * @access  Private - Admin/Doctor
 */
router.get(
  '/export',
  auth,
  requireRole(USER_ROLES.ADMIN, USER_ROLES.DOCTOR),
  validateRequest({
    query: {
      format: {
        type: 'string',
        enum: ['json', 'csv'],
        optional: true
      },
      parentId: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
        optional: true
      }
    }
  }),
  childController.exportChildren
);

/**
 * @route   POST /api/children
 * @desc    Create a new child
 * @access  Private
 */
router.post(
  '/',
  auth,
  validateRequest(childSchema),
  childController.createChild
);

/**
 * @route   GET /api/children/:id
 * @desc    Get child by ID
 * @access  Private (Own child or Admin/Doctor)
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
  childController.getChildById
);

/**
 * @route   PUT /api/children/:id
 * @desc    Update child information
 * @access  Private (Own child or Admin/Doctor)
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
  validateRequest(childUpdateSchema),
  childController.updateChild
);

/**
 * @route   DELETE /api/children/:id
 * @desc    Delete a child
 * @access  Private (Own child or Admin)
 */
router.delete(
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
  childController.deleteChild
);

/**
 * @route   GET /api/children/:id/vaccination-schedule
 * @desc    Get child's vaccination schedule
 * @access  Private (Own child or Admin/Doctor)
 */
router.get(
  '/:id/vaccination-schedule',
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
  childController.getVaccinationSchedule
);

/**
 * @route   POST /api/children/:id/generate-schedule
 * @desc    Generate vaccination schedule for a child
 * @access  Private (Own child or Admin/Doctor)
 */
router.post(
  '/:id/generate-schedule',
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
  childController.generateVaccinationSchedule
);

/**
 * @route   GET /api/children/:id/statistics
 * @desc    Get child statistics
 * @access  Private (Own child or Admin/Doctor)
 */
router.get(
  '/:id/statistics',
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
  childController.getChildStatistics
);

/**
 * @route   POST /api/children/:id/upload-image
 * @desc    Upload child's profile image
 * @access  Private (Own child or Admin/Doctor)
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
  upload.single('childImage'),
  childController.uploadChildImage
);

// FIXED: Error handling middleware for multer - correct function signature
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
        message: 'Unexpected field name. Please use "childImage" as the field name.'
      });
    }
  }
  
  if (error.message && error.message.includes('Invalid file type')) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
  
  next(error);
});

module.exports = router;