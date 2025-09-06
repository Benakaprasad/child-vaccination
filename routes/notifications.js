const express = require('express');
const notificationController = require('../controllers/notificationController');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const { notificationSchema, paginationSchema } = require('../utils/validators');
const { USER_ROLES, NOTIFICATION_TYPES, DELIVERY_METHODS } = require('../utils/constants');

const router = express.Router();

/**
 * @route   GET /api/notifications
 * @desc    Get notifications for current user
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
      status: {
        type: 'string',
        enum: ['pending', 'sent', 'failed'],
        optional: true
      },
      type: {
        type: 'string',
        enum: Object.values(NOTIFICATION_TYPES),
        optional: true
      },
      unreadOnly: {
        type: 'boolean',
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
  notificationController.getNotifications
);

/**
 * @route   GET /api/notifications/unread-count
 * @desc    Get count of unread notifications
 * @access  Private
 */
router.get(
  '/unread-count',
  auth,
  notificationController.getUnreadCount
);

/**
 * @route   GET /api/notifications/statistics
 * @desc    Get notification statistics
 * @access  Private - Admin/Doctor
 */
router.get(
  '/statistics',
  auth,
  requireRole([USER_ROLES.ADMIN, USER_ROLES.DOCTOR]),
  validateRequest({
    query: {
      userId: {
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
  notificationController.getNotificationStatistics
);

/**
 * @route   GET /api/notifications/pending
 * @desc    Get pending notifications (Admin/Doctor only)
 * @access  Private - Admin/Doctor
 */
router.get(
  '/pending',
  auth,
  requireRole([USER_ROLES.ADMIN, USER_ROLES.DOCTOR]),
  validateRequest(paginationSchema, 'query'),
  notificationController.getPendingNotifications
);

/**
 * @route   POST /api/notifications
 * @desc    Create a new notification (Admin/Doctor only)
 * @access  Private - Admin/Doctor
 */
router.post(
  '/',
  auth,
  requireRole([USER_ROLES.ADMIN, USER_ROLES.DOCTOR]),
  validateRequest(notificationSchema),
  notificationController.createNotification
);

/**
 * @route   POST /api/notifications/broadcast
 * @desc    Send broadcast notification to multiple users (Admin only)
 * @access  Private - Admin
 */
router.post(
  '/broadcast',
  auth,
  requireRole([USER_ROLES.ADMIN]),
  validateRequest({
    body: {
      recipients: {
        type: 'array',
        required: true,
        minItems: 1,
        maxItems: 1000,
        items: {
          type: 'string',
          pattern: '^[0-9a-fA-F]{24}$'
        }
      },
      title: {
        type: 'string',
        required: true,
        maxLength: 100
      },
      message: {
        type: 'string',
        required: true,
        maxLength: 500
      },
      type: {
        type: 'string',
        enum: Object.values(NOTIFICATION_TYPES),
        required: true
      },
      deliveryMethods: {
        type: 'array',
        required: true,
        minItems: 1,
        items: {
          type: 'string',
          enum: Object.values(DELIVERY_METHODS)
        }
      },
      scheduledDate: {
        type: 'string',
        format: 'date-time',
        optional: true
      }
    }
  }),
  notificationController.broadcastNotification
);

/**
 * @route   POST /api/notifications/send-vaccination-reminders
 * @desc    Send vaccination reminders (Admin/Doctor only)
 * @access  Private - Admin/Doctor
 */
router.post(
  '/send-vaccination-reminders',
  auth,
  requireRole([USER_ROLES.ADMIN, USER_ROLES.DOCTOR]),
  validateRequest({
    body: {
      type: {
        type: 'string',
        enum: ['upcoming', 'overdue'],
        required: true
      },
      daysAhead: {
        type: 'number',
        min: 1,
        max: 30,
        optional: true
      },
      childIds: {
        type: 'array',
        optional: true,
        items: {
          type: 'string',
          pattern: '^[0-9a-fA-F]{24}$'
        }
      },
      deliveryMethods: {
        type: 'array',
        required: true,
        minItems: 1,
        items: {
          type: 'string',
          enum: Object.values(DELIVERY_METHODS)
        }
      }
    }
  }),
  notificationController.sendVaccinationReminders
);

/**
 * @route   POST /api/notifications/process-pending
 * @desc    Process all pending notifications (Admin only)
 * @access  Private - Admin
 */
router.post(
  '/process-pending',
  auth,
  requireRole([USER_ROLES.ADMIN]),
  notificationController.processPendingNotifications
);

/**
 * @route   GET /api/notifications/:id
 * @desc    Get notification by ID
 * @access  Private (Own notification or Admin/Doctor)
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
  notificationController.getNotificationById
);

/**
 * @route   PUT /api/notifications/:id
 * @desc    Update notification (Admin/Doctor only)
 * @access  Private - Admin/Doctor
 */
router.put(
  '/:id',
  auth,
  requireRole([USER_ROLES.ADMIN, USER_ROLES.DOCTOR]),
  validateRequest({
    params: {
      id: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
        required: true
      }
    }
  }),
  validateRequest({
    body: {
      title: {
        type: 'string',
        maxLength: 100,
        optional: true
      },
      message: {
        type: 'string',
        maxLength: 500,
        optional: true
      },
      scheduledDate: {
        type: 'string',
        format: 'date-time',
        optional: true
      },
      deliveryMethods: {
        type: 'array',
        optional: true,
        minItems: 1,
        items: {
          type: 'string',
          enum: Object.values(DELIVERY_METHODS)
        }
      }
    }
  }),
  notificationController.updateNotification
);

/**
 * @route   DELETE /api/notifications/:id
 * @desc    Delete notification (Admin only)
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
  notificationController.deleteNotification
);

/**
 * @route   PATCH /api/notifications/:id/mark-read
 * @desc    Mark notification as read
 * @access  Private (Own notification)
 */
router.patch(
  '/:id/mark-read',
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
  notificationController.markAsRead
);

/**
 * @route   PATCH /api/notifications/:id/mark-unread
 * @desc    Mark notification as unread
 * @access  Private (Own notification)
 */
router.patch(
  '/:id/mark-unread',
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
  notificationController.markAsUnread
);

/**
 * @route   PATCH /api/notifications/mark-all-read
 * @desc    Mark all notifications as read for current user
 * @access  Private
 */
router.patch(
  '/mark-all-read',
  auth,
  notificationController.markAllAsRead
);

/**
 * @route   POST /api/notifications/:id/send
 * @desc    Send a specific notification immediately
 * @access  Private - Admin/Doctor
 */
router.post(
  '/:id/send',
  auth,
  requireRole([USER_ROLES.ADMIN, USER_ROLES.DOCTOR]),
  validateRequest({
    params: {
      id: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
        required: true
      }
    }
  }),
  notificationController.sendNotification
);

/**
 * @route   POST /api/notifications/:id/resend
 * @desc    Resend a failed notification
 * @access  Private - Admin/Doctor
 */
router.post(
  '/:id/resend',
  auth,
  requireRole([USER_ROLES.ADMIN, USER_ROLES.DOCTOR]),
  validateRequest({
    params: {
      id: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
        required: true
      }
    },
    body: {
      deliveryMethods: {
        type: 'array',
        optional: true,
        minItems: 1,
        items: {
          type: 'string',
          enum: Object.values(DELIVERY_METHODS)
        }
      }
    }
  }),
  notificationController.resendNotification
);

/**
 * @route   GET /api/notifications/:id/delivery-status
 * @desc    Get delivery status for a notification
 * @access  Private - Admin/Doctor
 */
router.get(
  '/:id/delivery-status',
  auth,
  requireRole([USER_ROLES.ADMIN, USER_ROLES.DOCTOR]),
  validateRequest({
    params: {
      id: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
        required: true
      }
    }
  }),
  notificationController.getDeliveryStatus
);

/**
 * @route   DELETE /api/notifications/bulk-delete
 * @desc    Delete multiple notifications (Admin only)
 * @access  Private - Admin
 */
router.delete(
  '/bulk-delete',
  auth,
  requireRole([USER_ROLES.ADMIN]),
  validateRequest({
    body: {
      notificationIds: {
        type: 'array',
        required: true,
        minItems: 1,
        maxItems: 100,
        items: {
          type: 'string',
          pattern: '^[0-9a-fA-F]{24}$'
        }
      }
    }
  }),
  notificationController.bulkDeleteNotifications
);

/**
 * @route   POST /api/notifications/test-delivery
 * @desc    Test notification delivery system (Admin only)
 * @access  Private - Admin
 */
router.post(
  '/test-delivery',
  auth,
  requireRole([USER_ROLES.ADMIN]),
  validateRequest({
    body: {
      recipient: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{24}$',
        required: true
      },
      deliveryMethods: {
        type: 'array',
        required: true,
        minItems: 1,
        items: {
          type: 'string',
          enum: Object.values(DELIVERY_METHODS)
        }
      },
      testMessage: {
        type: 'string',
        maxLength: 200,
        optional: true
      }
    }
  }),
  notificationController.testDelivery
);

module.exports = router;