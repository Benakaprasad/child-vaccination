const nodemailer = require('nodemailer');
// Fix: Import logger correctly from Winston setup
const { logger, logNotification } = require('../utils/logger');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initialize();
  }

  async initialize() {
    try {
      // Email configuration based on environment
      const emailConfig = {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER || process.env.EMAIL_USER || '',
          pass: process.env.SMTP_PASS || process.env.EMAIL_PASS || ''
        }
      };

      // Fix: Use createTransport (not createTransporter)
      this.transporter = nodemailer.createTransport(emailConfig);

      // Verify connection configuration only if credentials provided
      if (emailConfig.auth.user && emailConfig.auth.pass) {
        await this.transporter.verify();
        logger.info('Email service initialized and verified successfully', {
          host: emailConfig.host,
          port: emailConfig.port,
          secure: emailConfig.secure,
          type: 'email_service'
        });
      } else {
        logger.warn('Email service initialized but no credentials provided', {
          type: 'email_service'
        });
      }
      
    } catch (error) {
      logger.error('Failed to initialize email service', {
        error: error.message,
        stack: error.stack,
        type: 'email_service'
      });
    }
  }

  async sendEmail({ to, subject, html, text, attachments = [] }) {
    const startTime = Date.now();
    
    try {
      if (!this.transporter) {
        throw new Error('Email service not initialized');
      }

      const mailOptions = {
        from: process.env.FROM_EMAIL || process.env.EMAIL_FROM || 'noreply@vaccination-tracker.com',
        to,
        subject,
        html,
        text: text || this.stripHtml(html),
        attachments
      };

      const result = await this.transporter.sendMail(mailOptions);
      const duration = Date.now() - startTime;
      
      logger.info('Email sent successfully', {
        to,
        subject,
        messageId: result.messageId,
        duration: `${duration}ms`,
        type: 'email_delivery'
      });

      // Log notification success
      logNotification('email', null, 'email', true);

      return {
        success: true,
        messageId: result.messageId,
        response: result.response
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Failed to send email', {
        to,
        subject,
        error: error.message,
        duration: `${duration}ms`,
        type: 'email_delivery'
      });

      // Log notification failure
      logNotification('email', null, 'email', false, error);

      return {
        success: false,
        error: error.message
      };
    }
  }

  async sendVaccinationReminder({ to, childName, vaccineName, scheduledDate, clinicInfo, userId = null }) {
    const subject = `Vaccination Reminder: ${vaccineName} for ${childName}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c5282;">Vaccination Reminder</h2>
        
        <p>Dear Parent/Guardian,</p>
        
        <p>This is a friendly reminder that <strong>${childName}</strong> has a scheduled vaccination:</p>
        
        <div style="background-color: #f7fafc; padding: 20px; margin: 20px 0; border-radius: 8px;">
          <h3 style="color: #2d3748; margin-top: 0;">Vaccination Details</h3>
          <p><strong>Vaccine:</strong> ${vaccineName}</p>
          <p><strong>Date:</strong> ${new Date(scheduledDate).toLocaleDateString()}</p>
          <p><strong>Time:</strong> ${new Date(scheduledDate).toLocaleTimeString()}</p>
          
          ${clinicInfo ? `
            <h4 style="color: #2d3748;">Clinic Information</h4>
            <p><strong>Name:</strong> ${clinicInfo.name}</p>
            <p><strong>Address:</strong> ${clinicInfo.address}</p>
            <p><strong>Phone:</strong> ${clinicInfo.phone}</p>
          ` : ''}
        </div>
        
        <p>Please ensure ${childName} is well-rested and has eaten before the appointment.</p>
        
        <p>If you need to reschedule, please contact the clinic as soon as possible.</p>
        
        <p>Thank you for staying up-to-date with your child's vaccinations!</p>
        
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
        <p style="color: #718096; font-size: 12px;">
          This is an automated message from the Child Vaccination Tracking System.
        </p>
      </div>
    `;

    const result = await this.sendEmail({ to, subject, html });
    
    // Log business event
    logger.info('Vaccination reminder sent', {
      userId,
      childName,
      vaccineName,
      scheduledDate,
      success: result.success,
      type: 'vaccination_reminder'
    });

    return result;
  }

  async sendOverdueNotification({ to, childName, vaccineName, originalDate, daysOverdue, userId = null }) {
    const subject = `OVERDUE: ${vaccineName} vaccination for ${childName}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #e53e3e;">Overdue Vaccination Notice</h2>
        
        <p>Dear Parent/Guardian,</p>
        
        <div style="background-color: #fed7d7; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #e53e3e;">
          <p><strong>${childName}</strong> has missed a scheduled vaccination:</p>
          <p><strong>Vaccine:</strong> ${vaccineName}</p>
          <p><strong>Originally scheduled:</strong> ${new Date(originalDate).toLocaleDateString()}</p>
          <p><strong>Days overdue:</strong> ${daysOverdue}</p>
        </div>
        
        <p>It's important to keep vaccinations up to date to protect your child's health.</p>
        
        <p>Please contact your healthcare provider or clinic to reschedule this vaccination as soon as possible.</p>
        
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
        <p style="color: #718096; font-size: 12px;">
          This is an automated message from the Child Vaccination Tracking System.
        </p>
      </div>
    `;

    const result = await this.sendEmail({ to, subject, html });
    
    // Log business event
    logger.warn('Overdue vaccination notification sent', {
      userId,
      childName,
      vaccineName,
      daysOverdue,
      success: result.success,
      type: 'overdue_notification'
    });

    return result;
  }

  async sendWelcomeEmail({ to, userName, resetLink, userId = null }) {
    const subject = 'Welcome to Child Vaccination Tracker';
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c5282;">Welcome to Child Vaccination Tracker!</h2>
        
        <p>Hello ${userName},</p>
        
        <p>Thank you for registering with our Child Vaccination Tracking System. Your account has been created successfully.</p>
        
        ${resetLink ? `
          <div style="background-color: #ebf8ff; padding: 20px; margin: 20px 0; border-radius: 8px;">
            <p>To get started, please set your password by clicking the link below:</p>
            <p><a href="${resetLink}" style="background-color: #3182ce; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Set Password</a></p>
            <p style="font-size: 12px; color: #718096;">This link will expire in 24 hours.</p>
          </div>
        ` : ''}
        
        <p>With this system, you can:</p>
        <ul>
          <li>Track your child's vaccination schedule</li>
          <li>Receive automated reminders</li>
          <li>View vaccination history</li>
          <li>Update contact information</li>
        </ul>
        
        <p>If you have any questions, please don't hesitate to contact us.</p>
        
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
        <p style="color: #718096; font-size: 12px;">
          This is an automated message from the Child Vaccination Tracking System.
        </p>
      </div>
    `;

    const result = await this.sendEmail({ to, subject, html });
    
    // Log business event
    logger.info('Welcome email sent', {
      userId,
      userName,
      email: to,
      success: result.success,
      type: 'welcome_email'
    });

    return result;
  }

  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '');
  }

  // Test method for development
  async testConnection() {
    try {
      if (!this.transporter) {
        throw new Error('Email service not initialized');
      }
      
      await this.transporter.verify();
      logger.info('Email service connection test successful', {
        type: 'email_service'
      });
      
      return { success: true, message: 'Email service is working correctly' };
    } catch (error) {
      logger.error('Email service connection test failed', {
        error: error.message,
        type: 'email_service'
      });
      
      return { success: false, error: error.message };
    }
  }
}

module.exports = new EmailService();