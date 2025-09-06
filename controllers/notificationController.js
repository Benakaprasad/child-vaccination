const Notification = require('../models/Notification');
const Child = require('../models/Child');
const User = require('../models/User');
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
const { logger } = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');

class NotificationController {
  /**
   * Get notifications for the authenticated user
   */
  async getNotifications(req, res, next) {
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
      
      const userId = req.user._id || req.user.userId;
      const userRole = req.user.role;

      // Validate pagination parameters
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(50, Math.max(1, parseInt(limit)));

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

      // Apply additional filters with validation
      if (type && Object.values(NOTIFICATION_TYPES).includes(type)) {
        filter.type = type;
      }
      
      if (isRead !== undefined) {
        filter.isRead = isRead === 'true';
      }
      
      if (priority && ['low', 'medium', 'high', 'urgent'].includes(priority)) {
        filter.priority = priority;
      }

      const query = Notification.find(filter)
        .populate('recipient', 'name email')
        .populate('relatedChild', 'name dateOfBirth')
        .populate('relatedVaccination', 'vaccineName scheduledDate')
        .populate('createdBy', 'name email');

      const result = await paginateResults(
        query,
        pageNum,
        limitNum,
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
      next(error);
    }
  }

  /**
   * Get a specific notification by ID
   */
  async getNotificationById(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user._id || req.user.userId;
      const userRole = req.user.role;

      // Validate MongoDB ObjectId format
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new AppError('Invalid notification ID format', 400);
      }

      const notification = await Notification.findById(id)
        .populate('recipient', 'name email')
        .populate('relatedChild', 'name dateOfBirth')
        .populate('relatedVaccination', 'vaccineName scheduledDate')
        .populate('createdBy', 'name email');

      if (!notification) {
        throw new AppError(ERROR_MESSAGES.NOTIFICATION_NOT_FOUND || 'Notification not found', 404);
      }

      // Check permissions
      const canAccess = notification.recipient._id.toString() === userId.toString() ||
                       notification.assignedTo?.toString() === userId.toString() ||
                       (userRole === USER_ROLES.ADMIN);

      if (!canAccess) {
        throw new AppError(ERROR_MESSAGES.ACCESS_DENIED || 'Access denied', 403);
      }

      // Mark as read if recipient is viewing and notification is unread
      if (notification.recipient._id.toString() === userId.toString() && !notification.isRead) {
        notification.isRead = true;
        notification.readAt = new Date();
        await notification.save();
      }

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Notification retrieved successfully', { notification })
      );

    } catch (error) {
      logger.error('Get notification by ID error:', error);
      next(error);
    }
  }

  /**
   * Create a new notification (Admin/Doctor only)
   */
  async createNotification(req, res, next) {
    try {
      const notificationData = req.body;
      const userId = req.user._id || req.user.userId;
      const userRole = req.user.role;

      // Only doctors and admins can create notifications manually
      if (userRole === USER_ROLES.PARENT) {
        throw new AppError(ERROR_MESSAGES.ACCESS_DENIED || 'Access denied', 403);
      }

      // Validate required fields
      const requiredFields = ['recipient', 'type', 'title', 'message'];
      const missingFields = requiredFields.filter(field => !notificationData[field]);
      
      if (missingFields.length > 0) {
        throw new AppError(`Missing required fields: ${missingFields.join(', ')}`, 400);
      }

      // Validate notification type
      if (!Object.values(NOTIFICATION_TYPES).includes(notificationData.type)) {
        throw new AppError('Invalid notification type', 400);
      }

      // Validate recipient exists (could be User or Child depending on context)
      let recipient;
      if (notificationData.type === NOTIFICATION_TYPES.VACCINATION_REMINDER) {
        recipient = await User.findById(notificationData.recipient);
      } else {
        recipient = await User.findById(notificationData.recipient);
      }

      if (!recipient) {
        throw new AppError('Recipient not found', 404);
      }

      // Validate delivery methods
      if (notificationData.deliveryMethods) {
        const validMethods = Object.values(DELIVERY_METHODS);
        const invalidMethods = notificationData.deliveryMethods.filter(
          method => !validMethods.includes(method)
        );
        
        if (invalidMethods.length > 0) {
          throw new AppError(`Invalid delivery methods: ${invalidMethods.join(', ')}`, 400);
        }
      }

      const notification = new Notification({
        ...notificationData,
        createdBy: userId,
        deliveryMethods: notificationData.deliveryMethods || [DELIVERY_METHODS.EMAIL]
      });

      await notification.save();

      // Send notification through service
      try {
        await notificationService.sendNotification(notification._id);
      } catch (sendError) {
        logger.error('Failed to send notification:', sendError);
        // Don't fail creation if sending fails, but log the error
      }

      await notification.populate([
        { path: 'recipient', select: 'name email' },
        { path: 'relatedChild', select: 'name' },
        { path: 'createdBy', select: 'name email' }
      ]);

      logger.info(`Notification created: ${notification._id} for ${recipient.email || recipient.name}`);

      res.status(HTTP_STATUS.CREATED).json(
        createApiResponse(true, 'Notification created successfully', { notification })
      );

    } catch (error) {
      logger.error('Create notification error:', error);
      next(error);
    }
  }

  /**
   * Mark a notification as read
   */
  async markAsRead(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user._id || req.user.userId;

      // Validate MongoDB ObjectId format
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new AppError('Invalid notification ID format', 400);
      }

      const notification = await Notification.findById(id);
      if (!notification) {
        throw new AppError(ERROR_MESSAGES.NOTIFICATION_NOT_FOUND || 'Notification not found', 404);
      }

      // Check if user is the recipient
      if (notification.recipient.toString() !== userId.toString()) {
        throw new AppError(ERROR_MESSAGES.ACCESS_DENIED || 'Access denied', 403);
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
      logger.error('Mark as read error:', error);
      next(error);
    }
  }

  /**
   * Mark a notification as unread
   */
  async markAsUnread(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user._id || req.user.userId;

      // Validate MongoDB ObjectId format
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new AppError('Invalid notification ID format', 400);
      }

      const notification = await Notification.findById(id);
      if (!notification) {
        throw new AppError(ERROR_MESSAGES.NOTIFICATION_NOT_FOUND || 'Notification not found', 404);
      }

      // Check if user is the recipient
      if (notification.recipient.toString() !== userId.toString()) {
        throw new AppError(ERROR_MESSAGES.ACCESS_DENIED || 'Access denied', 403);
      }

      if (!notification.isRead) {
        return res.status(HTTP_STATUS.OK).json(
          createApiResponse(true, 'Notification is already unread', { notification })
        );
      }

      notification.isRead = false;
      notification.readAt = null;
      await notification.save();

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Notification marked as unread', { notification })
      );

    } catch (error) {
      logger.error('Mark as unread error:', error);
      next(error);
    }
  }

  /**
   * Mark all notifications as read for the authenticated user
   */
  async markAllAsRead(req, res, next) {
    try {
      const userId = req.user._id || req.user.userId;

      const result = await Notification.updateMany(
        { recipient: userId, isRead: false },
        { 
          isRead: true, 
          readAt: new Date() 
        }
      );

      logger.info(`User ${userId} marked ${result.modifiedCount} notifications as read`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(
          true, 
          `${result.modifiedCount} notifications marked as read`,
          { updatedCount: result.modifiedCount }
        )
      );

    } catch (error) {
      logger.error('Mark all as read error:', error);
      next(error);
    }
  }

  /**
   * Delete a notification
   */
  async deleteNotification(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user._id || req.user.userId;
      const userRole = req.user.role;

      // Validate MongoDB ObjectId format
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new AppError('Invalid notification ID format', 400);
      }

      const notification = await Notification.findById(id);
      if (!notification) {
        throw new AppError(ERROR_MESSAGES.NOTIFICATION_NOT_FOUND || 'Notification not found', 404);
      }

      // Only admin or notification recipient can delete
      if (userRole !== USER_ROLES.ADMIN && notification.recipient.toString() !== userId.toString()) {
        throw new AppError(ERROR_MESSAGES.ACCESS_DENIED || 'Access denied', 403);
      }

      await Notification.findByIdAndDelete(id);

      logger.info(`Notification deleted: ${id} by user ${req.user.email || userId}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Notification deleted successfully')
      );

    } catch (error) {
      logger.error('Delete notification error:', error);
      next(error);
    }
  }

  /**
   * Get count of unread notifications for the authenticated user
   */
  async getUnreadCount(req, res, next) {
    try {
      const userId = req.user._id || req.user.userId;

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
      next(error);
    }
  }

  /**
   * Get notification statistics for the authenticated user
   */
  async getNotificationStatistics(req, res, next) {
    try {
      const userId = req.user._id || req.user.userId;
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

      const [stats, recentStats] = await Promise.all([
        // Overall statistics
        Notification.aggregate([
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
        ]),
        
        // Recent statistics (last 7 days)
        Notification.aggregate([
          { 
            $match: {
              ...matchStage,
              createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
            }
          },
          {
            $group: {
              _id: null,
              recentTotal: { $sum: 1 },
              recentUnread: { $sum: { $cond: [{ $eq: ['$isRead', false] }, 1, 0] } }
            }
          }
        ])
      ]);

      // Group by type and priority
      const typeStats = {};
      const priorityStats = {};

      if (stats.length > 0 && stats[0].byType) {
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
          read: stats[0]?.read || 0,
          recentTotal: recentStats[0]?.recentTotal || 0,
          recentUnread: recentStats[0]?.recentUnread || 0
        },
        byType: typeStats,
        byPriority: priorityStats
      };

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Notification statistics retrieved successfully', { statistics })
      );

    } catch (error) {
      logger.error('Get notification statistics error:', error);
      next(error);
    }
  }

  /**
   * Update notification preferences for the authenticated user
   */
  async updateNotificationPreferences(req, res, next) {
    try {
      const userId = req.user._id || req.user.userId;
      const preferences = req.body;

      if (!preferences || typeof preferences !== 'object') {
        throw new AppError('Valid preferences object is required', 400);
      }

      // Validate delivery methods if provided
      if (preferences.deliveryMethods) {
        const validMethods = Object.values(DELIVERY_METHODS);
        const invalidMethods = preferences.deliveryMethods.filter(
          method => !validMethods.includes(method)
        );
        
        if (invalidMethods.length > 0) {
          throw new AppError(`Invalid delivery methods: ${invalidMethods.join(', ')}`, 400);
        }
      }

      const user = await User.findById(userId);
      if (!user) {
        throw new AppError('User not found', 404);
      }

      user.notificationPreferences = {
        ...user.notificationPreferences,
        ...preferences
      };

      await user.save();

      logger.info(`Notification preferences updated for user: ${user.email || userId}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(
          true, 
          'Notification preferences updated successfully', 
          { preferences: user.notificationPreferences }
        )
      );

    } catch (error) {
      logger.error('Update notification preferences error:', error);
      next(error);
    }
  }

  /**
   * Send a test notification (Admin only)
   */
  async sendTestNotification(req, res, next) {
    try {
      const { recipient, deliveryMethod, message } = req.body;
      const userId = req.user._id || req.user.userId;
      const userRole = req.user.role;

      // Only admins can send test notifications
      if (userRole !== USER_ROLES.ADMIN) {
        throw new AppError(ERROR_MESSAGES.ACCESS_DENIED || 'Access denied', 403);
      }

      // Validate recipient
      if (!recipient || !recipient.match(/^[0-9a-fA-F]{24}$/)) {
        throw new AppError('Valid recipient ID is required', 400);
      }

      // Validate delivery method
      if (deliveryMethod && !Object.values(DELIVERY_METHODS).includes(deliveryMethod)) {
        throw new AppError('Invalid delivery method', 400);
      }

      // Check if recipient exists
      const recipientUser = await User.findById(recipient);
      if (!recipientUser) {
        throw new AppError('Recipient not found', 404);
      }

      const testNotification = new Notification({
        recipient,
        type: NOTIFICATION_TYPES.SYSTEM || 'system',
        title: 'Test Notification',
        message: message || 'This is a test notification to verify delivery settings.',
        priority: 'low',
        deliveryMethods: [deliveryMethod || DELIVERY_METHODS.EMAIL || 'email'],
        createdBy: userId
      });

      await testNotification.save();

      // Send through notification service
      try {
        await notificationService.sendNotification(testNotification._id);
        
        logger.info(`Test notification sent: ${testNotification._id} to ${recipientUser.email}`);
        
        res.status(HTTP_STATUS.OK).json(
          createApiResponse(true, 'Test notification sent successfully', { 
            notificationId: testNotification._id,
            recipient: {
              id: recipientUser._id,
              email: recipientUser.email,
              name: recipientUser.name
            }
          })
        );
      } catch (sendError) {
        logger.error('Failed to send test notification:', sendError);
        throw new AppError('Failed to send test notification', 500);
      }

    } catch (error) {
      logger.error('Send test notification error:', error);
      next(error);
    }
  }

  /**
   * Mark multiple notifications as read
   */
  async bulkMarkAsRead(req, res, next) {
    try {
      const { notificationIds } = req.body;
      const userId = req.user._id || req.user.userId;

      if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
        throw new AppError('Valid notification IDs array is required', 400);
      }

      // Validate all IDs
      const invalidIds = notificationIds.filter(id => !id.match(/^[0-9a-fA-F]{24}$/));
      if (invalidIds.length > 0) {
        throw new AppError('Invalid notification ID format detected', 400);
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

      logger.info(`Bulk mark as read: ${result.modifiedCount} notifications by user ${userId}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(
          true,
          `${result.modifiedCount} notifications marked as read`,
          { 
            updatedCount: result.modifiedCount,
            requestedCount: notificationIds.length
          }
        )
      );

    } catch (error) {
      logger.error('Bulk mark as read error:', error);
      next(error);
    }
  }

  /**
   * Delete multiple notifications
   */
  async bulkDeleteNotifications(req, res, next) {
    try {
      const { notificationIds } = req.body;
      const userId = req.user._id || req.user.userId;
      const userRole = req.user.role;

      if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
        throw new AppError('Valid notification IDs array is required', 400);
      }

      // Validate all IDs
      const invalidIds = notificationIds.filter(id => !id.match(/^[0-9a-fA-F]{24}$/));
      if (invalidIds.length > 0) {
        throw new AppError('Invalid notification ID format detected', 400);
      }

      let filter = { _id: { $in: notificationIds } };

      // Non-admins can only delete their own notifications
      if (userRole !== USER_ROLES.ADMIN) {
        filter.recipient = userId;
      }

      const result = await Notification.deleteMany(filter);

      logger.info(`Bulk delete notifications: ${result.deletedCount} deleted by ${req.user.email || userId}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(
          true,
          `${result.deletedCount} notifications deleted`,
          { 
            deletedCount: result.deletedCount,
            requestedCount: notificationIds.length
          }
        )
      );

    } catch (error) {
      logger.error('Bulk delete notifications error:', error);
      next(error);
    }
  }

  /**
   * Get recent notifications for the authenticated user
   */
  async getRecentNotifications(req, res, next) {
    try {
      const { limit = 10, days = 30 } = req.query;
      const userId = req.user._id || req.user.userId;

      // Validate and sanitize inputs
      const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
      const daysNum = Math.min(90, Math.max(1, parseInt(days)));

      const dateThreshold = new Date();
      dateThreshold.setDate(dateThreshold.getDate() - daysNum);

      const notifications = await Notification.find({
        recipient: userId,
        createdAt: { $gte: dateThreshold }
      })
      .populate('relatedChild', 'name dateOfBirth')
      .populate('relatedVaccination', 'vaccineName scheduledDate')
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .lean();

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Recent notifications retrieved successfully', {
          notifications,
          total: notifications.length,
          dateRange: {
            from: dateThreshold,
            to: new Date(),
            days: daysNum
          }
        })
      );

    } catch (error) {
      logger.error('Get recent notifications error:', error);
      next(error);
    }
  }

  /**
   * Get notifications by type
   */
  async getNotificationsByType(req, res, next) {
    try {
      const { type } = req.params;
      const { page = 1, limit = 10 } = req.query;
      const userId = req.user._id || req.user.userId;

      if (!Object.values(NOTIFICATION_TYPES).includes(type)) {
        throw new AppError('Invalid notification type', 400);
      }

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(50, Math.max(1, parseInt(limit)));

      const filter = { recipient: userId, type };
      const query = Notification.find(filter)
        .populate('relatedChild', 'name')
        .populate('relatedVaccination', 'vaccineName scheduledDate');

      const result = await paginateResults(
        query,
        pageNum,
        limitNum,
        'createdAt',
        'desc'
      );

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(
          true,
          `${type} notifications retrieved successfully`,
          result.data,
          { 
            pagination: result.pagination,
            type 
          }
        )
      );

    } catch (error) {
      logger.error('Get notifications by type error:', error);
      next(error);
    }
  }
}

module.exports = new NotificationController();