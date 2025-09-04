const twilio = require('twilio');
const { formatDate } = require('../utils/helpers');
const logger = require('../utils/logger');

class SMSService {
  constructor() {
    this.client = null;
    this.initialize();
  }

  /**
   * Initialize SMS service
   */
  initialize() {
    try {
      if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
        logger.warn('Twilio credentials not found. SMS service will be disabled.');
        return;
      }

      this.client = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );

      logger.info('SMS service initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize SMS service:', error);
      throw error;
    }
  }

  /**
   * Send SMS message
   * @param {Object} options - SMS options
   * @returns {Object} Send result
   */
  async sendSMS(options) {
    try {
      if (!this.client) {
        throw new Error('SMS service not initialized. Please check Twilio credentials.');
      }

      const { to, message, from } = options;

      if (!to || !message) {
        throw new Error('SMS recipient and message are required');
      }

      // Format phone number
      const formattedTo = this.formatPhoneNumber(to);
      const fromNumber = from || process.env.TWILIO_PHONE_NUMBER;

      if (!fromNumber) {
        throw new Error('Twilio phone number not configured');
      }

      const messageOptions = {
        body: message,
        from: fromNumber,
        to: formattedTo
      };

      const result = await this.client.messages.create(messageOptions);

      logger.info(`SMS sent successfully to ${formattedTo}: ${result.sid}`);

      return {
        success: true,
        messageId: result.sid,
        recipient: formattedTo,
        status: result.status,
        direction: result.direction
      };

    } catch (error) {
      logger.error('Failed to send SMS:', error);
      throw error;
    }
  }

  /**
   * Send bulk SMS messages
   * @param {Array} messages - Array of SMS options
   * @returns {Array} Send results
   */
  async sendBulkSMS(messages) {
    const results = [];

    for (const messageOptions of messages) {
      try {
        const result = await this.sendSMS(messageOptions);
        results.push({ success: true, result, phone: messageOptions.to });
      } catch (error) {
        logger.error(`Failed to send bulk SMS to ${messageOptions.to}:`, error);
        results.push({ 
          success: false, 
          error: error.message, 
          phone: messageOptions.to 
        });
      }

      // Add small delay between messages to avoid rate limiting
      await this.sleep(100);
    }

    const successCount = results.filter(r => r.success).length;
    logger.info(`Bulk SMS send completed: ${successCount}/${messages.length} successful`);

    return results;
  }

  /**
   * Send vaccination reminder SMS
   * @param {Object} user - User object
   * @param {Object} child - Child object
   * @param {Object} vaccination - Vaccination object
   * @returns {Object} Send result
   */
  async sendVaccinationReminder(user, child, vaccination) {
    const scheduledDate = formatDate(vaccination.scheduledDate, 'MMM DD, YYYY');
    const message = `Hi ${user.firstName}! Reminder: ${child.firstName} has a ${vaccination.vaccine.name} vaccination scheduled for ${scheduledDate}. Please don't miss it!`;

    return await this.sendSMS({
      to: user.phone,
      message: this.truncateMessage(message)
    });
  }

  /**
   * Send overdue vaccination SMS
   * @param {Object} user - User object
   * @param {Object} child - Child object
   * @param {Object} vaccination - Vaccination object
   * @param {Number} daysOverdue - Days overdue
   * @returns {Object} Send result
   */
  async sendOverdueVaccinationSMS(user, child, vaccination, daysOverdue) {
    const message = `URGENT: ${child.firstName}'s ${vaccination.vaccine.name} vaccination is ${daysOverdue} days overdue. Please schedule an appointment immediately for their health and safety.`;

    return await this.sendSMS({
      to: user.phone,
      message: this.truncateMessage(message)
    });
  }

  /**
   * Send vaccination completed SMS
   * @param {Object} user - User object
   * @param {Object} child - Child object
   * @param {Object} vaccination - Vaccination object
   * @returns {Object} Send result
   */
  async sendVaccinationCompletedSMS(user, child, vaccination) {
    const completedDate = formatDate(vaccination.administeredDate, 'MMM DD, YYYY');
    const message = `Great news! ${child.firstName} successfully received the ${vaccination.vaccine.name} vaccination on ${completedDate}. Keep up the great work protecting their health!`;

    return await this.sendSMS({
      to: user.phone,
      message: this.truncateMessage(message)
    });
  }

  /**
   * Send appointment confirmation SMS
   * @param {Object} user - User object
   * @param {Object} appointmentDetails - Appointment details
   * @returns {Object} Send result
   */
  async sendAppointmentConfirmation(user, appointmentDetails) {
    const { childName, vaccineName, date, time, location } = appointmentDetails;
    const message = `Appointment confirmed! ${childName}'s ${vaccineName} vaccination is scheduled for ${date} at ${time}. Location: ${location}. See you there!`;

    return await this.sendSMS({
      to: user.phone,
      message: this.truncateMessage(message)
    });
  }

  /**
   * Send OTP SMS
   * @param {String} phoneNumber - Phone number
   * @param {String} otp - OTP code
   * @returns {Object} Send result
   */
  async sendOTP(phoneNumber, otp) {
    const message = `Your verification code for Vaccination Tracking System is: ${otp}. This code will expire in 10 minutes. Please do not share this code with anyone.`;

    return await this.sendSMS({
      to: phoneNumber,
      message: this.truncateMessage(message)
    });
  }

  /**
   * Format phone number for international format
   * @param {String} phoneNumber - Phone number
   * @returns {String} Formatted phone number
   */
  formatPhoneNumber(phoneNumber) {
    // Remove all non-digit characters
    let cleaned = phoneNumber.replace(/\D/g, '');

    // Add country code if not present
    if (cleaned.length === 10) {
      cleaned = '1' + cleaned; // Default to US/Canada
    }

    // Add + prefix for international format
    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }

    return cleaned;
  }

  /**
   * Validate phone number format
   * @param {String} phoneNumber - Phone number
   * @returns {Boolean} Is valid
   */
  isValidPhoneNumber(phoneNumber) {
    try {
      const formatted = this.formatPhoneNumber(phoneNumber);
      // Basic validation for international format
      const phoneRegex = /^\+[1-9]\d{1,14}$/;
      return phoneRegex.test(formatted);
    } catch {
      return false;
    }
  }

  /**
   * Truncate message to SMS length limit
   * @param {String} message - Message to truncate
   * @param {Number} maxLength - Maximum length (default 160)
   * @returns {String} Truncated message
   */
  truncateMessage(message, maxLength = 160) {
    if (message.length <= maxLength) {
      return message;
    }

    // Truncate and add ellipsis
    return message.substring(0, maxLength - 3) + '...';
  }

  /**
   * Get SMS delivery status
   * @param {String} messageId - Message ID from Twilio
   * @returns {Object} Delivery status
   */
  async getDeliveryStatus(messageId) {
    try {
      if (!this.client) {
        throw new Error('SMS service not initialized');
      }

      const message = await this.client.messages(messageId).fetch();

      return {
        messageId: message.sid,
        status: message.status,
        errorCode: message.errorCode,
        errorMessage: message.errorMessage,
        dateCreated: message.dateCreated,
        dateUpdated: message.dateUpdated,
        dateSent: message.dateSent,
        price: message.price,
        priceUnit: message.priceUnit
      };

    } catch (error) {
      logger.error('Failed to get SMS delivery status:', error);
      throw error;
    }
  }

  /**
   * Get account SMS usage statistics
   * @param {Date} startDate - Start date for statistics
   * @param {Date} endDate - End date for statistics
   * @returns {Object} Usage statistics
   */
  async getUsageStatistics(startDate, endDate) {
    try {
      if (!this.client) {
        throw new Error('SMS service not initialized');
      }

      const messages = await this.client.messages.list({
        dateSentAfter: startDate,
        dateSentBefore: endDate
      });

      const stats = {
        totalMessages: messages.length,
        deliveredMessages: 0,
        failedMessages: 0,
        pendingMessages: 0,
        totalCost: 0
      };

      messages.forEach(message => {
        switch (message.status) {
          case 'delivered':
            stats.deliveredMessages++;
            break;
          case 'failed':
          case 'undelivered':
            stats.failedMessages++;
            break;
          case 'queued':
          case 'sending':
          case 'sent':
            stats.pendingMessages++;
            break;
        }

        if (message.price) {
          stats.totalCost += Math.abs(parseFloat(message.price));
        }
      });

      return stats;

    } catch (error) {
      logger.error('Failed to get SMS usage statistics:', error);
      throw error;
    }
  }

  /**
   * Test SMS configuration
   * @param {String} testPhoneNumber - Phone number to send test SMS
   * @returns {Object} Test result
   */
  async testSMSConfiguration(testPhoneNumber) {
    try {
      if (!this.client) {
        throw new Error('SMS service not initialized. Please check Twilio credentials.');
      }

      if (!testPhoneNumber) {
        throw new Error('Test phone number is required');
      }

      const testMessage = `Test message from Vaccination Tracking System sent at ${formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss')}`;

      const result = await this.sendSMS({
        to: testPhoneNumber,
        message: testMessage
      });

      return {
        success: true,
        message: 'SMS configuration test successful',
        messageId: result.messageId,
        recipient: testPhoneNumber
      };

    } catch (error) {
      logger.error('SMS configuration test failed:', error);
      return {
        success: false,
        message: 'SMS configuration test failed',
        error: error.message
      };
    }
  }

  /**
   * Sleep function for rate limiting
   * @param {Number} ms - Milliseconds to sleep
   * @returns {Promise} Sleep promise
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if SMS service is available
   * @returns {Boolean} Is available
   */
  isAvailable() {
    return this.client !== null;
  }

  /**
   * Get remaining SMS credits (if applicable)
   * @returns {Object} Credit information
   */
  async getCreditInfo() {
    try {
      if (!this.client) {
        throw new Error('SMS service not initialized');
      }

      const account = await this.client.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();

      return {
        accountSid: account.sid,
        friendlyName: account.friendlyName,
        status: account.status,
        type: account.type,
        dateCreated: account.dateCreated,
        dateUpdated: account.dateUpdated
      };

    } catch (error) {
      logger.error('Failed to get SMS credit info:', error);
      throw error;
    }
  }
}

module.exports = new SMSService();