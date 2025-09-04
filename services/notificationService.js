const Notification = require('../models/Notification');
const User = require('../models/User');
const VaccinationRecord = require('../models/VaccinationRecord');
const emailService = require('./emailService');
const smsService = require('./smsService');
const { 
  NOTIFICATION_TYPES, 
  DELIVERY_METHODS, 
  VACCINATION_STATUS,
  SUCCESS_MESSAGES,
  ERROR_MESSAGES 
} = require('../utils/constants');
const { 
  formatDate, 
  getDaysUntil, 
  capitalizeWords,
  createApiResponse 
} = require('../utils/helpers');
const logger = require('../utils/logger');

class NotificationService {
  /**
   * Create a new notification
   * @param {Object} notificationData - Notification data
   * @returns {Object} Created notification
   */
  async createNotification(notificationData) {
    try {
      const notification = new Notification(notificationData);
      await notification.save();
      
      logger.info(`Notification created: ${notification._id}`);
      return notification;
    } catch (error) {
      logger.error('Error creating notification:', error);
      throw new Error(ERROR_MESSAGES.INTERNAL_ERROR);
    }
  }

  /**
   * Send notification via specified delivery methods
   * @param {String} notificationId - Notification ID
   * @returns {Object} Send result
   */
  async sendNotification(notificationId) {
    try {
      const notification = await Notification.findById(notificationId)
        .populate('recipient', 'firstName lastName email phone preferences')
        .populate('vaccinationRecord');

      if (!notification) {
        throw new Error(ERROR_MESSAGES.NOTIFICATION_NOT_FOUND);
      }

      const user = notification.recipient;
      const results = [];

      // Send via each specified delivery method
      for (const method of notification.deliveryMethods) {
        try {
          let result;
          
          switch (method) {
            case DELIVERY_METHODS.EMAIL:
              if (user.preferences.notifications.email && user.email) {
                result = await this.sendEmailNotification(notification, user);
              }
              break;
              
            case DELIVERY_METHODS.SMS:
              if (user.preferences.notifications.sms && user.phone) {
                result = await this.sendSMSNotification(notification, user);
              }
              break;
              
            case DELIVERY_METHODS.PUSH:
              if (user.preferences.notifications.push) {
                result = await this.sendPushNotification(notification, user);
              }
              break;
          }
          
          if (result) {
            results.push({ method, status: 'sent', result });
            notification.deliveryStatus.push({
              method,
              status: 'sent',
              sentAt: new Date()
            });
          }
        } catch (methodError) {
          logger.error(`Failed to send ${method} notification:`, methodError);
          results.push({ 
            method, 
            status: 'failed', 
            error: methodError.message 
          });
          notification.deliveryStatus.push({
            method,
            status: 'failed',
            error: methodError.message,
            attemptedAt: new Date()
          });
        }
      }

      // Update notification status
      const successfulDeliveries = results.filter(r => r.status === 'sent').length;
      notification.status = successfulDeliveries > 0 ? 'sent' : 'failed';
      notification.sentAt = successfulDeliveries > 0 ? new Date() : null;
      
      await notification.save();

      logger.info(`Notification ${notificationId} processed: ${successfulDeliveries}/${results.length} successful`);
      
      return createApiResponse(
        true,
        SUCCESS_MESSAGES.NOTIFICATION_SENT,
        { 
          notificationId,
          deliveryResults: results,
          successfulDeliveries,
          totalAttempts: results.length
        }
      );

    } catch (error) {
      logger.error('Error sending notification:', error);
      throw new Error(ERROR_MESSAGES.NOTIFICATION_SEND_FAILED);
    }
  }

  /**
   * Send email notification
   * @param {Object} notification - Notification object
   * @param {Object} user - User object
   * @returns {Object} Email send result
   */
  async sendEmailNotification(notification, user) {
    const subject = `Vaccination ${capitalizeWords(notification.type)}: ${notification.title}`;
    const templateData = this.prepareTemplateData(notification, user);
    
    return await emailService.sendEmail({
      to: user.email,
      subject,
      template: this.getEmailTemplate(notification.type),
      data: templateData
    });
  }

  /**
   * Send SMS notification
   * @param {Object} notification - Notification object
   * @param {Object} user - User object
   * @returns {Object} SMS send result
   */
  async sendSMSNotification(notification, user) {
    const message = this.formatSMSMessage(notification, user);
    
    return await smsService.sendSMS({
      to: user.phone,
      message
    });
  }

  /**
   * Send push notification (placeholder for future implementation)
   * @param {Object} notification - Notification object
   * @param {Object} user - User object
   * @returns {Object} Push notification result
   */
  async sendPushNotification(notification, user) {
    // This would integrate with a push notification service like FCM
    logger.info(`Push notification would be sent to user ${user._id}: ${notification.title}`);
    
    return {
      success: true,
      message: 'Push notification queued',
      recipient: user._id
    };
  }

  /**
   * Create vaccination reminder notification
   * @param {String} vaccinationRecordId - Vaccination record ID
   * @param {Number} daysBefore - Days before scheduled date
   * @returns {Object} Created notification
   */
  async createVaccinationReminder(vaccinationRecordId, daysBefore = 7) {
    try {
      const vaccinationRecord = await VaccinationRecord.findById(vaccinationRecordId)
        .populate('child', 'firstName lastName parent')
        .populate('vaccine', 'name');

      if (!vaccinationRecord || vaccinationRecord.status !== VACCINATION_STATUS.SCHEDULED) {
        return null;
      }

      const scheduledDate = new Date(vaccinationRecord.scheduledDate);
      const reminderDate = new Date(scheduledDate);
      reminderDate.setDate(reminderDate.getDate() - daysBefore);

      // Don't create reminders for past dates
      if (reminderDate <= new Date()) {
        return null;
      }

      const child = vaccinationRecord.child;
      const vaccine = vaccinationRecord.vaccine;

      const notificationData = {
        recipient: child.parent,
        type: NOTIFICATION_TYPES.REMINDER,
        title: `Vaccination Reminder for ${child.firstName}`,
        message: `Don't forget! ${child.firstName} has a ${vaccine.name} vaccination scheduled for ${formatDate(scheduledDate, 'MMMM Do, YYYY')}.`,
        vaccinationRecord: vaccinationRecordId,
        scheduledDate: reminderDate,
        deliveryMethods: [DELIVERY_METHODS.EMAIL, DELIVERY_METHODS.SMS, DELIVERY_METHODS.PUSH]
      };

      return await this.createNotification(notificationData);
    } catch (error) {
      logger.error('Error creating vaccination reminder:', error);
      throw error;
    }
  }

  /**
   * Create overdue vaccination notification
   * @param {String} vaccinationRecordId - Vaccination record ID
   * @returns {Object} Created notification
   */
  async createOverdueNotification(vaccinationRecordId) {
    try {
      const vaccinationRecord = await VaccinationRecord.findById(vaccinationRecordId)
        .populate('child', 'firstName lastName parent')
        .populate('vaccine', 'name');

      if (!vaccinationRecord || vaccinationRecord.status !== VACCINATION_STATUS.SCHEDULED) {
        return null;
      }

      const child = vaccinationRecord.child;
      const vaccine = vaccinationRecord.vaccine;
      const daysOverdue = Math.abs(getDaysUntil(vaccinationRecord.scheduledDate));

      const notificationData = {
        recipient: child.parent,
        type: NOTIFICATION_TYPES.OVERDUE,
        title: `Overdue Vaccination for ${child.firstName}`,
        message: `${child.firstName}'s ${vaccine.name} vaccination is ${daysOverdue} days overdue. Please schedule an appointment as soon as possible.`,
        vaccinationRecord: vaccinationRecordId,
        scheduledDate: new Date(),
        deliveryMethods: [DELIVERY_METHODS.EMAIL, DELIVERY_METHODS.SMS, DELIVERY_METHODS.PUSH]
      };

      return await this.createNotification(notificationData);
    } catch (error) {
      logger.error('Error creating overdue notification:', error);
      throw error;
    }
  }

  /**
   * Create vaccination completion notification
   * @param {String} vaccinationRecordId - Vaccination record ID
   * @returns {Object} Created notification
   */
  async createCompletionNotification(vaccinationRecordId) {
    try {
      const vaccinationRecord = await VaccinationRecord.findById(vaccinationRecordId)
        .populate('child', 'firstName lastName parent')
        .populate('vaccine', 'name');

      if (!vaccinationRecord || vaccinationRecord.status !== VACCINATION_STATUS.COMPLETED) {
        return null;
      }

      const child = vaccinationRecord.child;
      const vaccine = vaccinationRecord.vaccine;

      const notificationData = {
        recipient: child.parent,
        type: NOTIFICATION_TYPES.COMPLETED,
        title: `Vaccination Completed for ${child.firstName}`,
        message: `Great news! ${child.firstName} has successfully received the ${vaccine.name} vaccination on ${formatDate(vaccinationRecord.administeredDate, 'MMMM Do, YYYY')}.`,
        vaccinationRecord: vaccinationRecordId,
        scheduledDate: new Date(),
        deliveryMethods: [DELIVERY_METHODS.EMAIL]
      };

      return await this.createNotification(notificationData);
    } catch (error) {
      logger.error('Error creating completion notification:', error);
      throw error;
    }
  }

  /**
   * Get pending notifications that should be sent
   * @returns {Array} Pending notifications
   */
  async getPendingNotifications() {
    try {
      return await Notification.find({
        status: 'pending',
        scheduledDate: { $lte: new Date() }
      }).populate('recipient vaccinationRecord');
    } catch (error) {
      logger.error('Error getting pending notifications:', error);
      throw error;
    }
  }

  /**
   * Process all pending notifications
   * @returns {Object} Processing results
   */
  async processPendingNotifications() {
    try {
      const pendingNotifications = await this.getPendingNotifications();
      const results = [];

      for (const notification of pendingNotifications) {
        try {
          const result = await this.sendNotification(notification._id);
          results.push({ notificationId: notification._id, success: true, result });
        } catch (error) {
          logger.error(`Failed to process notification ${notification._id}:`, error);
          results.push({ 
            notificationId: notification._id, 
            success: false, 
            error: error.message 
          });
        }
      }

      logger.info(`Processed ${results.length} pending notifications`);
      
      return createApiResponse(
        true,
        `Processed ${results.length} pending notifications`,
        {
          totalProcessed: results.length,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
          results
        }
      );

    } catch (error) {
      logger.error('Error processing pending notifications:', error);
      throw error;
    }
  }

  /**
   * Prepare template data for email/SMS
   * @param {Object} notification - Notification object
   * @param {Object} user - User object
   * @returns {Object} Template data
   */
  prepareTemplateData(notification, user) {
    return {
      userName: `${user.firstName} ${user.lastName}`,
      notificationTitle: notification.title,
      message: notification.message,
      type: notification.type,
      date: formatDate(new Date(), 'MMMM Do, YYYY'),
      vaccinationRecord: notification.vaccinationRecord
    };
  }

  /**
   * Get email template name based on notification type
   * @param {String} type - Notification type
   * @returns {String} Template name
   */
  getEmailTemplate(type) {
    const templates = {
      [NOTIFICATION_TYPES.REMINDER]: 'vaccination-reminder',
      [NOTIFICATION_TYPES.OVERDUE]: 'vaccination-overdue',
      [NOTIFICATION_TYPES.COMPLETED]: 'vaccination-completed',
      [NOTIFICATION_TYPES.CANCELLED]: 'vaccination-cancelled'
    };
    
    return templates[type] || 'default-notification';
  }

  /**
   * Format SMS message
   * @param {Object} notification - Notification object
   * @param {Object} user - User object
   * @returns {String} Formatted SMS message
   */
  formatSMSMessage(notification, user) {
    return `Hello ${user.firstName}, ${notification.message} - Vaccination Tracking System`;
  }

  /**
   * Get notification statistics
   * @param {String} userId - User ID (optional)
   * @returns {Object} Notification statistics
   */
  async getNotificationStats(userId = null) {
    try {
      const filter = userId ? { recipient: userId } : {};
      
      const stats = await Notification.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      const typeStats = await Notification.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 }
          }
        }
      ]);

      return {
        statusBreakdown: stats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {}),
        typeBreakdown: typeStats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {}),
        totalNotifications: stats.reduce((sum, stat) => sum + stat.count, 0)
      };

    } catch (error) {
      logger.error('Error getting notification stats:', error);
      throw error;
    }
  }
}

module.exports = new NotificationService();