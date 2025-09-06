const express = require('express');
const vaccineController = require('../controllers/vaccineController');
const { auth, requireRole } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const { USER_ROLES, VACCINE_TYPES } = require('../utils/constants');

const router = express.Router();

/**
 * @route   GET /api/vaccines
 * @desc    Get all vaccines
 * @access  Private
 */
router.get(
  '/',
  auth,
  validateRequest({
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
      sortBy: {
        type: 'string',
        optional: true
      },
      sortOrder: {
        type: 'string',
        enum: ['asc', 'desc'],
        optional: true
      },
      type: {
        type: 'string',
        enum: Object.values(VACCINE_TYPES),
        optional: true
      },
      manufacturer: {
        type: 'string',
        optional: true
      },
      isActive: {
        type: 'boolean',
        optional: true
      },
      search: {
        type: 'string',
        minLength: 2,
        optional: true
      }
    }
  }),
  vaccineController.getAllVaccines
);

/**
 * @route   GET /api/vaccines/search
 * @desc    Search vaccines
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
      type: {
        type: 'string',
        enum: Object.values(VACCINE_TYPES),
        optional: true
      },
      manufacturer: {
        type: 'string',
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
  vaccineController.searchVaccines
);

/**
 * @route   GET /api/vaccines/statistics
 * @desc    Get vaccine statistics
 * @access  Private - Admin/Doctor
 */
router.get(
  '/statistics',
  auth,
  requireRole(USER_ROLES.ADMIN, USER_ROLES.DOCTOR),
  vaccineController.getVaccineStatistics
);

/**
 * @route   GET /api/vaccines/types
 * @desc    Get vaccines grouped by type
 * @access  Private
 */
router.get(
  '/types',
  auth,
  validateRequest({
    query: {
      isActive: {
        type: 'boolean',
        optional: true
      }
    }
  }),
  vaccineController.getVaccinesByType
);

/**
 * @route   GET /api/vaccines/manufacturers
 * @desc    Get list of vaccine manufacturers
 * @access  Private
 */
router.get(
  '/manufacturers',
  auth,
  vaccineController.getManufacturers
);

/**
 * @route   GET /api/vaccines/schedule/:childAge
 * @desc    Get recommended vaccines for a specific child age
 * @access  Private
 */
router.get(
  '/schedule/:childAge',
  auth,
  validateRequest({
    params: {
      childAge: {
        type: 'number',
        min: 0,
        required: true
      }
    },
    query: {
      unit: {
        type: 'string',
        enum: ['days', 'weeks', 'months', 'years'],
        optional: true
      }
    }
  }),
  vaccineController.getVaccinesForAge
);

/**
 * @route   POST /api/vaccines
 * @desc    Create a new vaccine
 * @access  Private - Doctor/Admin
 */
router.post(
  '/',
  auth,
  requireRole(USER_ROLES.DOCTOR, USER_ROLES.ADMIN),
  // FIXED: Changed from validateRequest(vaccineSchema) to inline schema
  validateRequest({
    body: {
      name: {
        type: 'string',
        required: true,
        maxLength: 100
      },
      genericName: {
        type: 'string',
        optional: true,
        maxLength: 100
      },
      manufacturer: {
        type: 'string',
        required: true,
        maxLength: 100
      },
      type: {
        type: 'string',
        enum: Object.values(VACCINE_TYPES),
        required: true
      },
      description: {
        type: 'string',
        maxLength: 1000,
        optional: true
      },
      ageRanges: {
        type: 'array',
        required: true,
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            minAge: { type: 'number', min: 0 },
            maxAge: { type: 'number', min: 0 },
            unit: { type: 'string', enum: ['days', 'weeks', 'months', 'years'] }
          }
        }
      },
      doses: {
        type: 'array',
        required: true,
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            doseNumber: { type: 'number', min: 1 },
            ageAtDose: { type: 'number', min: 0 },
            unit: { type: 'string', enum: ['days', 'weeks', 'months', 'years'] },
            intervalFromPrevious: { type: 'number', min: 0, optional: true }
          }
        }
      },
      sideEffects: {
        type: 'array',
        optional: true,
        items: {
          type: 'string',
          maxLength: 200
        }
      },
      contraindications: {
        type: 'array',
        optional: true,
        items: {
          type: 'string',
          maxLength: 200
        }
      },
      isActive: {
        type: 'boolean',
        optional: true
      }
    }
  }),
  vaccineController.createVaccine
);

/**
 * @route   GET /api/vaccines/:id
 * @desc    Get vaccine by ID
 * @access  Private
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
  vaccineController.getVaccineById
);

/**
 * @route   PUT /api/vaccines/:id
 * @desc    Update vaccine
 * @access  Private - Doctor/Admin
 */
router.put(
  '/:id',
  auth,
  requireRole(USER_ROLES.DOCTOR, USER_ROLES.ADMIN),
  validateRequest({
    params: {
      id: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
        required: true
      }
    }
  }),
  // FIXED: Changed from validateRequest(vaccineUpdateSchema) to inline schema
  validateRequest({
    body: {
      name: {
        type: 'string',
        maxLength: 100,
        optional: true
      },
      genericName: {
        type: 'string',
        maxLength: 100,
        optional: true
      },
      manufacturer: {
        type: 'string',
        maxLength: 100,
        optional: true
      },
      type: {
        type: 'string',
        enum: Object.values(VACCINE_TYPES),
        optional: true
      },
      description: {
        type: 'string',
        maxLength: 1000,
        optional: true
      },
      ageRanges: {
        type: 'array',
        optional: true,
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            minAge: { type: 'number', min: 0 },
            maxAge: { type: 'number', min: 0 },
            unit: { type: 'string', enum: ['days', 'weeks', 'months', 'years'] }
          }
        }
      },
      doses: {
        type: 'array',
        optional: true,
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            doseNumber: { type: 'number', min: 1 },
            ageAtDose: { type: 'number', min: 0 },
            unit: { type: 'string', enum: ['days', 'weeks', 'months', 'years'] },
            intervalFromPrevious: { type: 'number', min: 0, optional: true }
          }
        }
      },
      sideEffects: {
        type: 'array',
        optional: true,
        items: {
          type: 'string',
          maxLength: 200
        }
      },
      contraindications: {
        type: 'array',
        optional: true,
        items: {
          type: 'string',
          maxLength: 200
        }
      },
      isActive: {
        type: 'boolean',
        optional: true
      }
    }
  }),
  vaccineController.updateVaccine
);

/**
 * @route   DELETE /api/vaccines/:id
 * @desc    Delete vaccine (Admin only)
 * @access  Private - Admin
 */
router.delete(
  '/:id',
  auth,
  requireRole(USER_ROLES.ADMIN),
  validateRequest({
    params: {
      id: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
        required: true
      }
    }
  }),
  vaccineController.deleteVaccine
);

/**
 * @route   PATCH /api/vaccines/:id/toggle-status
 * @desc    Activate/Deactivate vaccine
 * @access  Private - Doctor/Admin
 */
router.patch(
  '/:id/toggle-status',
  auth,
  requireRole(USER_ROLES.DOCTOR, USER_ROLES.ADMIN),
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
  vaccineController.toggleVaccineStatus
);

/**
 * @route   GET /api/vaccines/:id/schedule-info
 * @desc    Get detailed schedule information for a vaccine
 * @access  Private
 */
router.get(
  '/:id/schedule-info',
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
  vaccineController.getVaccineScheduleInfo
);

/**
 * @route   POST /api/vaccines/bulk-create
 * @desc    Create multiple vaccines at once (Admin only)
 * @access  Private - Admin
 */
router.post(
  '/bulk-create',
  auth,
  requireRole(USER_ROLES.ADMIN),
  validateRequest({
    body: {
      vaccines: {
        type: 'array',
        required: true,
        minItems: 1,
        maxItems: 50,
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              required: true,
              maxLength: 100
            },
            genericName: {
              type: 'string',
              optional: true,
              maxLength: 100
            },
            manufacturer: {
              type: 'string',
              required: true,
              maxLength: 100
            },
            type: {
              type: 'string',
              enum: Object.values(VACCINE_TYPES),
              required: true
            },
            description: {
              type: 'string',
              maxLength: 1000,
              optional: true
            },
            ageRanges: {
              type: 'array',
              required: true,
              minItems: 1,
              items: {
                type: 'object',
                properties: {
                  minAge: { type: 'number', min: 0 },
                  maxAge: { type: 'number', min: 0 },
                  unit: { type: 'string', enum: ['days', 'weeks', 'months', 'years'] }
                }
              }
            },
            doses: {
              type: 'array',
              required: true,
              minItems: 1,
              items: {
                type: 'object',
                properties: {
                  doseNumber: { type: 'number', min: 1 },
                  ageAtDose: { type: 'number', min: 0 },
                  unit: { type: 'string', enum: ['days', 'weeks', 'months', 'years'] },
                  intervalFromPrevious: { type: 'number', min: 0, optional: true }
                }
              }
            },
            sideEffects: {
              type: 'array',
              optional: true,
              items: {
                type: 'string',
                maxLength: 200
              }
            },
            contraindications: {
              type: 'array',
              optional: true,
              items: {
                type: 'string',
                maxLength: 200
              }
            },
            isActive: {
              type: 'boolean',
              optional: true
            }
          }
        }
      }
    }
  }),
  vaccineController.bulkCreateVaccines
);

/**
 * @route   GET /api/vaccines/:id/usage-statistics
 * @desc    Get usage statistics for a specific vaccine
 * @access  Private - Admin/Doctor
 */
router.get(
  '/:id/usage-statistics',
  auth,
  requireRole(USER_ROLES.ADMIN, USER_ROLES.DOCTOR),
  validateRequest({
    params: {
      id: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
        required: true
      }
    },
    query: {
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
  vaccineController.getVaccineUsageStatistics
);

module.exports = router;