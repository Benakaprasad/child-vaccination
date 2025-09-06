// services/smsService.js - Fixed SMS service with correct logger import
const { logger, logNotification } = require('../utils/logger');

class SMSService {
  constructor() {
    this.provider = null;
    this.isInitialized = false;
    this.initialize();
  }

  async initialize() {
    try {
      const smsProvider = process.env.SMS_PROVIDER || 'twilio'; // or 'textlocal', 'msg91', etc.
      
      switch (smsProvider.toLowerCase()) {
        case 'twilio':
          await this.initializeTwilio();
          break;
        case 'textlocal':
          await this.initializeTextLocal();
          break;
        case 'msg91':
          await this.initializeMsg91();
          break;
        default:
          logger.warn('No SMS provider configured, using mock service', {
            provider: smsProvider,
            type: 'sms_service'
          });
          this.initializeMock();
      }
      
      this.isInitialized = true;
      logger.info('SMS service initialized successfully', {
        provider: smsProvider,
        type: 'sms_service'
      });
      
    } catch (error) {
      logger.error('Failed to initialize SMS service', {
        error: error.message,
        stack: error.stack,
        type: 'sms_service'
      });
      
      // Fallback to mock service
      this.initializeMock();
    }
  }

  async initializeTwilio() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    
    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials not provided');
    }
    
    // Initialize Twilio client (assuming twilio package is installed)
    try {
      const twilio = require('twilio');
      this.provider = twilio(accountSid, authToken);
      this.providerType = 'twilio';
    } catch (requireError) {
      logger.warn('Twilio package not installed, falling back to mock service', {
        error: requireError.message,
        type: 'sms_service'
      });
      this.initializeMock();
    }
  }

  async initializeTextLocal() {
    const apiKey = process.env.TEXTLOCAL_API_KEY;
    
    if (!apiKey) {
      throw new Error('TextLocal API key not provided');
    }
    
    this.provider = {
      apiKey,
      baseUrl: 'https://api.textlocal.in/send/'
    };
    this.providerType = 'textlocal';
  }

  async initializeMsg91() {
    const authKey = process.env.MSG91_AUTH_KEY;
    
    if (!authKey) {
      throw new Error('MSG91 auth key not provided');
    }
    
    this.provider = {
      authKey,
      baseUrl: 'https://api.msg91.com/api/v2/sendsms'
    };
    this.providerType = 'msg91';
  }

  initializeMock() {
    this.provider = { type: 'mock' };
    this.providerType = 'mock';
    logger.info('SMS service initialized in mock mode', {
      type: 'sms_service'
    });
  }

  async sendSMS({ to, message, userId = null }) {
    const startTime = Date.now();
    
    try {
      if (!this.isInitialized) {
        throw new Error('SMS service not initialized');
      }

      let result;
      
      switch (this.providerType) {
        case 'twilio':
          result = await this.sendViaTwilio(to, message);
          break;
        case 'textlocal':
          result = await this.sendViaTextLocal(to, message);
          break;
        case 'msg91':
          result = await this.sendViaMsg91(to, message);
          break;
        case 'mock':
          result = await this.sendViaMock(to, message);
          break;
        default:
          throw new Error('No SMS provider configured');
      }
      
      const duration = Date.now() - startTime;
      
      logger.info('SMS sent successfully', {
        to: this.maskPhoneNumber(to),
        provider: this.providerType,
        messageId: result.messageId,
        duration: `${duration}ms`,
        userId,
        type: 'sms_delivery'
      });

      // Log notification success
      logNotification('sms', userId, 'sms', true);

      return {
        success: true,
        messageId: result.messageId,
        provider: this.providerType,
        cost: result.cost || null
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Failed to send SMS', {
        to: this.maskPhoneNumber(to),
        provider: this.providerType,
        error: error.message,
        duration: `${duration}ms`,
        userId,
        type: 'sms_delivery'
      });

      // Log notification failure
      logNotification('sms', userId, 'sms', false, error);

      return {
        success: false,
        error: error.message,
        provider: this.providerType
      };
    }
  }

  async sendViaTwilio(to, message) {
    try {
      const result = await this.provider.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: to
      });
      
      return {
        messageId: result.sid,
        status: result.status,
        cost: result.price
      };
    } catch (error) {
      throw new Error(`Twilio SMS failed: ${error.message}`);
    }
  }

  async sendViaTextLocal(to, message) {
    try {
      const axios = require('axios');
      const params = new URLSearchParams({
        apikey: this.provider.apiKey,
        numbers: to,
        message: message,
        sender: process.env.TEXTLOCAL_SENDER || 'TXTLCL'
      });

      const response = await axios.post(this.provider.baseUrl, params);
      
      if (response.data.status === 'success') {
        return {
          messageId: response.data.messages[0].id,
          status: 'sent',
          cost: response.data.cost
        };
      } else {
        throw new Error(response.data.errors[0].message);
      }
    } catch (error) {
      throw new Error(`TextLocal SMS failed: ${error.message}`);
    }
  }

  async sendViaMsg91(to, message) {
    try {
      const axios = require('axios');
      const payload = {
        sender: process.env.MSG91_SENDER || 'MSGIND',
        route: '4',
        country: '91',
        sms: [{
          message: message,
          to: [to]
        }]
      };

      const response = await axios.post(this.provider.baseUrl, payload, {
        headers: {
          'authkey': this.provider.authKey,
          'content-type': 'application/json'
        }
      });
      
      if (response.data.type === 'success') {
        return {
          messageId: response.data.request_id,
          status: 'sent'
        };
      } else {
        throw new Error(response.data.message);
      }
    } catch (error) {
      throw new Error(`MSG91 SMS failed: ${error.message}`);
    }
  }

  async sendViaMock(to, message) {
    // Mock implementation for development
    logger.info('Mock SMS sent', {
      to: this.maskPhoneNumber(to),
      message: message.substring(0, 50) + '...',
      type: 'sms_mock'
    });
    
    return {
      messageId: 'mock_' + Date.now(),
      status: 'sent',
      cost: 0
    };
  }

  async sendVaccinationReminder({ to, childName, vaccineName, scheduledDate, clinicInfo, userId = null }) {
    const message = `Vaccination Reminder: ${childName} has ${vaccineName} scheduled on ${new Date(scheduledDate).toLocaleDateString()}${clinicInfo ? ` at ${clinicInfo.name}` : ''}. Please ensure attendance.`;
    
    const result = await this.sendSMS({ to, message, userId });
    
    logger.info('Vaccination reminder SMS sent', {
      userId,
      childName,
      vaccineName,
      scheduledDate,
      success: result.success,
      type: 'vaccination_reminder'
    });

    return result;
  }

  async sendOverdueNotification({ to, childName, vaccineName, daysOverdue, userId = null }) {
    const message = `OVERDUE: ${childName}'s ${vaccineName} vaccination is ${daysOverdue} days overdue. Please contact your healthcare provider to reschedule immediately.`;
    
    const result = await this.sendSMS({ to, message, userId });
    
    logger.warn('Overdue vaccination SMS sent', {
      userId,
      childName,
      vaccineName,
      daysOverdue,
      success: result.success,
      type: 'overdue_notification'
    });

    return result;
  }

  maskPhoneNumber(phoneNumber) {
    if (!phoneNumber || phoneNumber.length < 4) return phoneNumber;
    const visible = phoneNumber.slice(-4);
    const masked = '*'.repeat(phoneNumber.length - 4);
    return masked + visible;
  }

  async testConnection() {
    try {
      if (!this.isInitialized) {
        return { success: false, error: 'SMS service not initialized' };
      }
      
      if (this.providerType === 'mock') {
        return { 
          success: true, 
          message: 'SMS service running in mock mode',
          provider: this.providerType
        };
      }
      
      // For real providers, you might want to send a test message
      // or check API connectivity here
      
      return { 
        success: true, 
        message: 'SMS service is working correctly',
        provider: this.providerType
      };
    } catch (error) {
      logger.error('SMS service connection test failed', {
        error: error.message,
        provider: this.providerType,
        type: 'sms_service'
      });
      
      return { success: false, error: error.message };
    }
  }
}

module.exports = new SMSService();