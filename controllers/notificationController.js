const Notification = require('../models/Notification');
const Child = require('../models/Child');
const VaccinationRecord = require('../models/VaccinationRecord');
const notificationService = require('../services/notificationService');
const { 
  createApiResponse,
  paginateResults,
  removeEmptyFields 
} = require('../utils/helpers');
const { 
  HTTP_STATUS, 
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  USER_ROLES,
  NOTIFICATION_TYPES,
  DELIVERY_METHODS 
} = require('../utils/constants');
const logger = require('../utils/logger');

class NotificationController {
  /**
   * Get notifications for current user
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getNotifications(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        type,
        isRead,
        priority
      } = req.query;
      const userId = req.user.userId;
      const userRole = req.user.role;

      let filter = {};

      // Filter by recipient based on role
      if (userRole === USER_ROLES.PARENT) {
        filter.recipient = userId;
      } else if (userRole === USER_ROLES.DOCTOR || userRole === USER_ROLES.ADMIN) {
        // Doctors and admins can see notifications assigned to them
        filter.$or = [
          { recipient: userId },
          { assignedTo: userId }
        ];
      }

      // Apply additional filters
      if (type) filter.type = type;
      if (isRead !== undefined) filter.isRead = isRead === 'true';
      if (priority) filter.priority = priority;

      const query = Notification.find(filter)
        .populate('recipient', 'firstName lastName email')
        .populate('relatedChild', 'firstName lastName')
        .populate('relatedVaccination')
        .populate('createdBy', 'firstName lastName');

      const result = await paginateResults(
        query,
        parseInt(page),
        parseInt(limit),
        sortBy,
        sortOrder
      );

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(
          true,
          'Notifications retrieved successfully',
          result.data,
          { pagination: result.pagination }
        )
      );

    } catch (error) {
      logger.error('Get notifications error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Get notification by ID
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getNotificationById(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const userRole = req.user.role;

      const notification = await Notification.findById(id)
        .populate('recipient', 'firstName lastName email')
        .populate('relatedChild', 'firstName lastName dateOfBirth')
        .populate('relatedVaccination')
        .populate('createdBy', 'firstName lastName');

      if (!notification) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, ERROR_MESSAGES.NOTIFICATION_NOT_FOUND)
        );
      }

      // Check permissions
      const canAccess = notification.recipient._id.toString() === userId ||
                       notification.assignedTo?.toString() === userId ||
                       (userRole === USER_ROLES.ADMIN);

      if (!canAccess) {
        return res.status(HTTP_STATUS.FORBIDDEN).json(
          createApiResponse(false, ERROR_MESSAGES.ACCESS_DENIED)
        );
      }

      // Mark as read if recipient is viewing
      if (notification.recipient._id.toString() === userId && !notification.isRead) {
        notification.isRead = true;
        notification.readAt = new Date();
        await notification.save();
      }

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Notification retrieved successfully', { notification })
      );

    } catch (error) {
      logger.error('Get notification by ID error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Create notification
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async createNotification(req, res) {
    try {
      const notificationData = req.body;
      const userId = req.user.userId;
      const userRole = req.user.role;

      // Only doctors and admins can create notifications manually
      if (userRole === USER_ROLES.PARENT) {
        return res.status(HTTP_STATUS.FORBIDDEN).json(
          createApiResponse(false, ERROR_MESSAGES.ACCESS_DENIED)
        );
      }

      // Validate recipient exists
      const recipient = await Child.findById(notificationData.recipient);
      if (!recipient) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, 'Recipient not found')
        );
      }

      const notification = new Notification({
        ...notificationData,
        createdBy: userId
      });

      await notification.save();

      // Send notification through service
      try {
        await notificationService.sendNotification(notification._id);
      } catch (sendError) {
        logger.error('Failed to send notification:', sendError);
        // Don't fail creation if sending fails
      }

      await notification.populate([
        { path: 'recipient', select: 'firstName lastName email' },
        { path: 'relatedChild', select: 'firstName lastName' },
        { path: 'createdBy', select: 'firstName lastName' }
      ]);

      logger.info(`Notification created: ${notification._id} for ${recipient.email}`);

      res.status(HTTP_STATUS.CREATED).json(
        createApiResponse(true, 'Notification created successfully', { notification })
      );

    } catch (error) {
      logger.error('Create notification error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Mark notification as read
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async markAsRead(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;

      const notification = await Notification.findById(id);
      if (!notification) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, ERROR_MESSAGES.NOTIFICATION_NOT_FOUND)
        );
      }

      // Check if user is the recipient
      if (notification.recipient.toString() !== userId) {
        return res.status(HTTP_STATUS.FORBIDDEN).json(
          createApiResponse(false, ERROR_MESSAGES.ACCESS_DENIED)
        );
      }

      if (notification.isRead) {
        return res.status(HTTP_STATUS.OK).json(
          createApiResponse(true, 'Notification already marked as read', { notification })
        );
      }

      notification.isRead = true;
      notification.readAt = new Date();
      await notification.save();

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Notification marked as read', { notification })
      );

    } catch (error) {
      logger.error('Mark notification as read error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Mark notification as unread
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async markAsUnread(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;

      const notification = await Notification.findById(id);
      if (!notification) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, ERROR_MESSAGES.NOTIFICATION_NOT_FOUND)
        );
      }

      // Check if user is the recipient
      if (notification.recipient.toString() !== userId) {
        return res.status(HTTP_STATUS.FORBIDDEN).json(
          createApiResponse(false, ERROR_MESSAGES.ACCESS_DENIED)
        );
      }

      notification.isRead = false;
      notification.readAt = null;
      await notification.save();

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Notification marked as unread', { notification })
      );

    } catch (error) {
      logger.error('Mark notification as unread error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Mark all notifications as read
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async markAllAsRead(req, res) {
    try {
      const userId = req.user.userId;

      const result = await Notification.updateMany(
        { recipient: userId, isRead: false },
        { 
          isRead: true, 
          readAt: new Date() 
        }
      );

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(
          true, 
          `${result.modifiedCount} notifications marked as read`,
          { updatedCount: result.modifiedCount }
        )
      );

    } catch (error) {
      logger.error('Mark all notifications as read error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Delete notification
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async deleteNotification(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const userRole = req.user.role;

      const notification = await Notification.findById(id);
      if (!notification) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, ERROR_MESSAGES.NOTIFICATION_NOT_FOUND)
        );
      }

      // Only admin or notification recipient can delete
      if (userRole !== USER_ROLES.ADMIN && notification.recipient.toString() !== userId) {
        return res.status(HTTP_STATUS.FORBIDDEN).json(
          createApiResponse(false, ERROR_MESSAGES.ACCESS_DENIED)
        );
      }

      await Notification.findByIdAndDelete(id);

      logger.info(`Notification deleted: ${id} by user ${req.user.email}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Notification deleted successfully')
      );

    } catch (error) {
      logger.error('Delete notification error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Get unread notification count
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getUnreadCount(req, res) {
    try {
      const userId = req.user.userId;

      const count = await Notification.countDocuments({
        recipient: userId,
        isRead: false
      });

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Unread count retrieved successfully', { 
          unreadCount: count 
        })
      );

    } catch (error) {
      logger.error('Get unread count error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Get notification statistics
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getNotificationStatistics(req, res) {
    try {
      const userId = req.user.userId;
      const userRole = req.user.role;

      let matchStage = {};

      if (userRole === USER_ROLES.PARENT) {
        matchStage.recipient = userId;
      } else if (userRole === USER_ROLES.DOCTOR || userRole === USER_ROLES.ADMIN) {
        // For doctors/admins, show all notifications they can access
        matchStage.$or = [
          { recipient: userId },
          { assignedTo: userId }
        ];
      }

      const stats = await Notification.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            unread: { $sum: { $cond: [{ $eq: ['$isRead', false] }, 1, 0] } },
            read: { $sum: { $cond: [{ $eq: ['$isRead', true] }, 1, 0] } },
            byType: {
              $push: {
                type: '$type',
                priority: '$priority',
                isRead: '$isRead'
              }
            }
          }
        }
      ]);

      // Group by type and priority
      const typeStats = {};
      const priorityStats = {};

      if (stats.length > 0) {
        stats[0].byType.forEach(notification => {
          // Type statistics
          if (!typeStats[notification.type]) {
            typeStats[notification.type] = { total: 0, unread: 0, read: 0 };
          }
          typeStats[notification.type].total++;
          if (notification.isRead) {
            typeStats[notification.type].read++;
          } else {
            typeStats[notification.type].unread++;
          }

          // Priority statistics
          if (!priorityStats[notification.priority]) {
            priorityStats[notification.priority] = { total: 0, unread: 0, read: 0 };
          }
          priorityStats[notification.priority].total++;
          if (notification.isRead) {
            priorityStats[notification.priority].read++;
          } else {
            priorityStats[notification.priority].unread++;
          }
        });
      }

      const statistics = {
        overview: {
          total: stats[0]?.total || 0,
          unread: stats[0]?.unread || 0,
          read: stats[0]?.read || 0
        },
        byType: typeStats,
        byPriority: priorityStats
      };

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Notification statistics retrieved successfully', { statistics })
      );

    } catch (error) {
      logger.error('Get notification statistics error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Update notification preferences
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async updateNotificationPreferences(req, res) {
    try {
      const userId = req.user.userId;
      const preferences = req.body;

      // Update user's notification preferences
      const user = await require('../models/User').findById(userId);
      if (!user) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, 'User not found')
        );
      }

      user.notificationPreferences = {
        ...user.notificationPreferences,
        ...preferences
      };

      await user.save();

      logger.info(`Notification preferences updated for user: ${user.email}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(
          true, 
          'Notification preferences updated successfully', 
          { preferences: user.notificationPreferences }
        )
      );

    } catch (error) {
      logger.error('Update notification preferences error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Send test notification
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async sendTestNotification(req, res) {
    try {
      const { recipient, deliveryMethod } = req.body;
      const userId = req.user.userId;
      const userRole = req.user.role;

      // Only admins can send test notifications
      if (userRole !== USER_ROLES.ADMIN) {
        return res.status(HTTP_STATUS.FORBIDDEN).json(
          createApiResponse(false, ERROR_MESSAGES.ACCESS_DENIED)
        );
      }

      const testNotification = new Notification({
        recipient,
        type: NOTIFICATION_TYPES.SYSTEM,
        title: 'Test Notification',
        message: 'This is a test notification to verify delivery settings.',
        priority: 'low',
        deliveryMethods: [deliveryMethod || DELIVERY_METHODS.EMAIL],
        createdBy: userId
      });

      await testNotification.save();

      // Send through notification service
      try {
        await notificationService.sendNotification(testNotification._id);
        
        res.status(HTTP_STATUS.OK).json(
          createApiResponse(true, 'Test notification sent successfully', { 
            notificationId: testNotification._id 
          })
        );
      } catch (sendError) {
        logger.error('Failed to send test notification:', sendError);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
          createApiResponse(false, 'Failed to send test notification')
        );
      }

    } catch (error) {
      logger.error('Send test notification error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Bulk mark notifications as read
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async bulkMarkAsRead(req, res) {
    try {
      const { notificationIds } = req.body;
      const userId = req.user.userId;

      if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json(
          createApiResponse(false, 'Invalid notification IDs provided')
        );
      }

      const result = await Notification.updateMany(
        {
          _id: { $in: notificationIds },
          recipient: userId,
          isRead: false
        },
        {
          isRead: true,
          readAt: new Date()
        }
      );

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(
          true,
          `${result.modifiedCount} notifications marked as read`,
          { updatedCount: result.modifiedCount }
        )
      );

    } catch (error) {
      logger.error('Bulk mark as read error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Bulk delete notifications
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async bulkDeleteNotifications(req, res) {
    try {
      const { notificationIds } = req.body;
      const userId = req.user.userId;
      const userRole = req.user.role;

      if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json(
          createApiResponse(false, 'Invalid notification IDs provided')
        );
      }

      let filter = { _id: { $in: notificationIds } };

      // Non-admins can only delete their own notifications
      if (userRole !== USER_ROLES.ADMIN) {
        filter.recipient = userId;
      }

      const result = await Notification.deleteMany(filter);

      logger.info(`Bulk delete notifications: ${result.deletedCount} deleted by ${req.user.email}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(
          true,
          `${result.deletedCount} notifications deleted`,
          { deletedCount: result.deletedCount }
        )
      );

    } catch (error) {
      logger.error('Bulk delete notifications error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Get recent notifications (last 30 days)
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getRecentNotifications(req, res) {
    try {
      const { limit = 10 } = req.query;
      const userId = req.user.userId;

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const notifications = await Notification.find({
        recipient: userId,
        createdAt: { $gte: thirtyDaysAgo }
      })
      .populate('relatedChild', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Recent notifications retrieved successfully', {
          notifications,
          total: notifications.length
        })
      );

    } catch (error) {
      logger.error('Get recent notifications error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }
}

module.exports = new NotificationController();