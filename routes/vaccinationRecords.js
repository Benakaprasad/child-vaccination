const express = require('express');
const vaccinationRecordController = require('../controllers/vaccinationRecordController');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const { 
  vaccinationRecordSchema, 
  vaccinationRecordUpdateSchema,
  completeVaccinationSchema,
  paginationSchema,
  dateRangeSchema 
} = require('../utils/validators');
const { USER_ROLES, VACCINATION_STATUS } = require('../utils/constants');

const router = express.Router();

/**
 * @route   GET /api/vaccination-records
 * @desc    Get vaccination records with optional filters
 * @access  Private
 */
router.get(
  '/',
  auth,
  validateRequest({
    query: {
      childId: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
        optional: true
      },
      vaccineId: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
        optional: true
      },
      status: {
        type: 'string',
        enum: Object.values(VACCINATION_STATUS),
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
      },
      sortBy: {
        type: 'string',
        optional: true
      },
      sortOrder: {
        type: 'string',
        enum: ['asc', 'desc'],
        optional: true
      }
    }
  }),
  vaccinationRecordController.getVaccinationRecords
);

/**
 * @route   GET /api/vaccination-records/child/:childId
 * @desc    Get vaccination records for a specific child
 * @access  Private (Own child or Admin/Doctor)
 */
router.get(
  '/child/:childId',
  auth,
  validateRequest({
    params: {
      childId: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
        required: true
      }
    },
    query: {
      status: {
        type: 'string',
        enum: Object.values(VACCINATION_STATUS),
        optional: true
      },
      vaccineId: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
        optional: true
      }
    }
  }),
  vaccinationRecordController.getChildVaccinationRecords
);

/**
 * @route   GET /api/vaccination-records/upcoming
 * @desc    Get upcoming vaccination records
 * @access  Private
 */
router.get(
  '/upcoming',
  auth,
  validateRequest({
    query: {
      days: {
        type: 'number',
        min: 1,
        max: 365,
        optional: true
      },
      childId: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
        optional: true
      }
    }
  }),
  vaccinationRecordController.getUpcomingVaccinations
);

/**
 * @route   GET /api/vaccination-records/overdue
 * @desc    Get overdue vaccination records
 * @access  Private
 */
router.get(
  '/overdue',
  auth,
  validateRequest({
    query: {
      childId: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
        optional: true
      },
      gracePeriod: {
        type: 'number',
        min: 0,
        max: 30,
        optional: true
      }
    }
  }),
  vaccinationRecordController.getOverdueVaccinations
);

/**
 * @route   GET /api/vaccination-records/statistics
 * @desc    Get vaccination statistics
 * @access  Private
 */
router.get(
  '/statistics',
  auth,
  validateRequest({
    query: {
      childId: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
        optional: true
      },
      parentId: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
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
  vaccinationRecordController.getVaccinationStatistics
);

/**
 * @route   GET /api/vaccination-records/calendar/:year/:month
 * @desc    Get vaccination records for calendar view
 * @access  Private
 */
router.get(
  '/calendar/:year/:month',
  auth,
  validateRequest({
    params: {
      year: {
        type: 'number',
        min: 2020,
        max: 2030,
        required: true
      },
      month: {
        type: 'number',
        min: 1,
        max: 12,
        required: true
      }
    },
    query: {
      childId: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
        optional: true
      }
    }
  }),
  vaccinationRecordController.getVaccinationCalendar
);

/**
 * @route   POST /api/vaccination-records
 * @desc    Create a new vaccination record (schedule vaccination)
 * @access  Private
 */
router.post(
  '/',
  auth,
  validateRequest(vaccinationRecordSchema),
  vaccinationRecordController.createVaccinationRecord
);

/**
 * @route   POST /api/vaccination-records/bulk-schedule
 * @desc    Schedule multiple vaccinations for a child
 * @access  Private - Doctor/Admin
 */
router.post(
  '/bulk-schedule',
  auth,
  requireRole([USER_ROLES.DOCTOR, USER_ROLES.ADMIN]),
  validateRequest({
    body: {
      childId: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
        required: true
      },
      vaccinations: {
        type: 'array',
        required: true,
        minItems: 1,
        maxItems: 20,
        items: {
          type: 'object',
          properties: {
            vaccine: {
              type: 'string',
              pattern: '^[0-9a-fA-F]{24}$',
              required: true
            },
            doseNumber: {
              type: 'number',
              min: 1,
              required: true
            },
            scheduledDate: {
              type: 'string',
              format: 'date-time',
              required: true
            },
            notes: {
              type: 'string',
              maxLength: 500,
              optional: true
            }
          }
        }
      }
    }
  }),
  vaccinationRecordController.bulkScheduleVaccinations
);

/**
 * @route   GET /api/vaccination-records/:id
 * @desc    Get vaccination record by ID
 * @access  Private (Own child's record or Admin/Doctor)
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
  vaccinationRecordController.getVaccinationRecordById
);

/**
 * @route   PUT /api/vaccination-records/:id
 * @desc    Update vaccination record
 * @access  Private (Own child's record or Admin/Doctor)
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
  validateRequest(vaccinationRecordUpdateSchema),
  vaccinationRecordController.updateVaccinationRecord
);

/**
 * @route   PATCH /api/vaccination-records/:id/complete
 * @desc    Mark vaccination as completed
 * @access  Private - Doctor/Admin
 */
router.patch(
  '/:id/complete',
  auth,
  requireRole([USER_ROLES.DOCTOR, USER_ROLES.ADMIN]),
  validateRequest({
    params: {
      id: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
        required: true
      }
    }
  }),
  validateRequest(completeVaccinationSchema),
  vaccinationRecordController.markVaccinationCompleted
);

/**
 * @route   PATCH /api/vaccination-records/:id/reschedule
 * @desc    Reschedule vaccination
 * @access  Private (Own child's record or Admin/Doctor)
 */
router.patch(
  '/:id/reschedule',
  auth,
  validateRequest({
    params: {
      id: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
        required: true
      }
    },
    body: {
      newScheduledDate: {
        type: 'string',
        format: 'date-time',
        required: true
      },
      reason: {
        type: 'string',
        maxLength: 500,
        optional: true
      },
      notes: {
        type: 'string',
        maxLength: 500,
        optional: true
      }
    }
  }),
  vaccinationRecordController.rescheduleVaccination
);

/**
 * @route   PATCH /api/vaccination-records/:id/cancel
 * @desc    Cancel vaccination
 * @access  Private (Own child's record or Admin/Doctor)
 */
router.patch(
  '/:id/cancel',
  auth,
  validateRequest({
    params: {
      id: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
        required: true
      }
    },
    body: {
      reason: {
        type: 'string',
        maxLength: 500,
        required: true
      }
    }
  }),
  vaccinationRecordController.cancelVaccination
);

/**
 * @route   PATCH /api/vaccination-records/:id/mark-missed
 * @desc    Mark vaccination as missed
 * @access  Private - Doctor/Admin
 */
router.patch(
  '/:id/mark-missed',
  auth,
  requireRole([USER_ROLES.DOCTOR, USER_ROLES.ADMIN]),
  validateRequest({
    params: {
      id: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
        required: true
      }
    },
    body: {
      reason: {
        type: 'string',
        maxLength: 500,
        optional: true
      },
      notes: {
        type: 'string',
        maxLength: 500,
        optional: true
      }
    }
  }),
  vaccinationRecordController.markVaccinationMissed
);

/**
 * @route   DELETE /api/vaccination-records/:id
 * @desc    Delete vaccination record (Admin only)
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
  vaccinationRecordController.deleteVaccinationRecord
);

/**
 * @route   GET /api/vaccination-records/:id/history
 * @desc    Get vaccination record history/changes
 * @access  Private (Own child's record or Admin/Doctor)
 */
router.get(
  '/:id/history',
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
  vaccinationRecordController.getVaccinationRecordHistory
);

/**
 * @route   POST /api/vaccination-records/:id/add-side-effects
 * @desc    Add side effects to a completed vaccination
 * @access  Private (Own child's record or Admin/Doctor)
 */
router.post(
  '/:id/add-side-effects',
  auth,
  validateRequest({
    params: {
      id: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
        required: true
      }
    },
    body: {
      sideEffects: {
        type: 'array',
        required: true,
        minItems: 1,
        items: {
          type: 'string',
          maxLength: 100
        }
      },
      severity: {
        type: 'string',
        enum: ['mild', 'moderate', 'severe'],
        optional: true
      },
      notes: {
        type: 'string',
        maxLength: 500,
        optional: true
      },
      reportedDate: {
        type: 'string',
        format: 'date-time',
        optional: true
      }
    }
  }),
  vaccinationRecordController.addSideEffects
);

/**
 * @route   GET /api/vaccination-records/export/child/:childId
 * @desc    Export child's vaccination records
 * @access  Private (Own child or Admin/Doctor)
 */
router.get(
  '/export/child/:childId',
  auth,
  validateRequest({
    params: {
      childId: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
        required: true
      }
    },
    query: {
      format: {
        type: 'string',
        enum: ['json', 'csv', 'pdf'],
        optional: true
      },
      includeCompleted: {
        type: 'boolean',
        optional: true
      },
      includeScheduled: {
        type: 'boolean',
        optional: true
      }
    }
  }),
  vaccinationRecordController.exportChildVaccinationRecords
);

/**
 * @route   POST /api/vaccination-records/batch-update-status
 * @desc    Update status for multiple vaccination records
 * @access  Private - Doctor/Admin
 */
router.post(
  '/batch-update-status',
  auth,
  requireRole([USER_ROLES.DOCTOR, USER_ROLES.ADMIN]),
  validateRequest({
    body: {
      recordIds: {
        type: 'array',
        required: true,
        minItems: 1,
        maxItems: 50,
        items: {
          type: 'string',
          pattern: '^[0-9a-fA-F]{24}$'
        }
      },
      status: {
        type: 'string',
        enum: Object.values(VACCINATION_STATUS),
        required: true
      },
      reason: {
        type: 'string',
        maxLength: 500,
        optional: true
      },
      notes: {
        type: 'string',
        maxLength: 500,
        optional: true
      }
    }
  }),
  vaccinationRecordController.batchUpdateStatus
);

/**
 * @route   GET /api/vaccination-records/compliance-report
 * @desc    Get vaccination compliance report
 * @access  Private - Admin/Doctor
 */
router.get(
  '/compliance-report',
  auth,
  requireRole([USER_ROLES.ADMIN, USER_ROLES.DOCTOR]),
  validateRequest({
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
      },
      ageGroup: {
        type: 'string',
        enum: ['0-1', '1-2', '2-5', '5-12', '12-18'],
        optional: true
      },
      vaccineId: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
        optional: true
      }
    }
  }),
  vaccinationRecordController.getComplianceReport
);

/**
 * @route   POST /api/vaccination-records/generate-reminders
 * @desc    Generate reminders for upcoming/overdue vaccinations
 * @access  Private - Admin/Doctor
 */
router.post(
  '/generate-reminders',
  auth,
  requireRole([USER_ROLES.ADMIN, USER_ROLES.DOCTOR]),
  validateRequest({
    body: {
      type: {
        type: 'string',
        enum: ['upcoming', 'overdue', 'both'],
        required: true
      },
      daysAhead: {
        type: 'number',
        min: 1,
        max: 30,
        optional: true
      },
      childId: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
        optional: true
      },
      deliveryMethods: {
        type: 'array',
        required: true,
        items: {
          type: 'string',
          enum: ['email', 'sms', 'push']
        }
      }
    }
  }),
  vaccinationRecordController.generateReminders
);

module.exports = router;