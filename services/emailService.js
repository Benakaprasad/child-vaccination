const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs').promises;
const { EMAIL_TEMPLATES } = require('../utils/constants');
const { formatDate } = require('../utils/helpers');
const logger = require('../utils/logger');

class EmailService {
  constructor() {
    this.transporter = null;
    this.templates = new Map();
    this.initialize();
  }

  /**
   * Initialize email service
   */
  async initialize() {
    try {
      // Create email transporter
      this.transporter = nodemailer.createTransporter({
        service: process.env.EMAIL_SERVICE || 'gmail',
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: process.env.EMAIL_PORT || 587,
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD
        }
      });

      // Verify connection
      if (process.env.NODE_ENV !== 'test') {
        await this.transporter.verify();
        logger.info('Email service initialized successfully');
      }

      // Load email templates
      await this.loadTemplates();

    } catch (error) {
      logger.error('Failed to initialize email service:', error);
      throw error;
    }
  }

  /**
   * Load email templates
   */
  async loadTemplates() {
    const templatesDir = path.join(__dirname, '../templates/email');
    
    try {
      // Create templates directory if it doesn't exist
      try {
        await fs.access(templatesDir);
      } catch {
        await fs.mkdir(templatesDir, { recursive: true });
        await this.createDefaultTemplates(templatesDir);
      }

      // Load all template files
      const templateFiles = await fs.readdir(templatesDir);
      
      for (const file of templateFiles) {
        if (file.endsWith('.html')) {
          const templateName = file.replace('.html', '');
          const templatePath = path.join(templatesDir, file);
          const templateContent = await fs.readFile(templatePath, 'utf-8');
          this.templates.set(templateName, templateContent);
        }
      }

      logger.info(`Loaded ${this.templates.size} email templates`);

    } catch (error) {
      logger.error('Error loading email templates:', error);
      // Create basic templates in memory
      this.createBasicTemplates();
    }
  }

  /**
   * Create default email templates
   */
  async createDefaultTemplates(templatesDir) {
    const templates = {
      'welcome.html': `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Welcome to Vaccination Tracking</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            margin: 0; 
            padding: 0; 
        }
        .container { 
            max-width: 600px; 
            margin: 0 auto; 
            padding: 20px; 
        }
        .header { 
            background-color: #4CAF50; 
            color: white; 
            padding: 20px; 
            text-align: center; 
            border-radius: 8px 8px 0 0;
        }
        .content { 
            padding: 20px; 
            background-color: #f9f9f9; 
            border: 1px solid #ddd;
        }
        .footer { 
            padding: 20px; 
            text-align: center; 
            font-size: 12px; 
            color: #666; 
            background-color: #f1f1f1;
            border-radius: 0 0 8px 8px;
        }
        .button { 
            display: inline-block; 
            padding: 12px 24px; 
            background-color: #4CAF50; 
            color: white; 
            text-decoration: none; 
            border-radius: 4px; 
            margin: 10px 0;
        }
        .feature-list {
            background-color: white;
            padding: 15px;
            border-radius: 4px;
            margin: 15px 0;
        }
        .feature-list li {
            margin: 8px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🩹 Welcome to Vaccination Tracking</h1>
        </div>
        <div class="content">
            <h2>Hello {{userName}}!</h2>
            <p>Welcome to our vaccination tracking system. We're here to help you keep track of your child's vaccination schedule and ensure they stay healthy and protected.</p>
            
            <div class="feature-list">
                <h3>With our system, you can:</h3>
                <ul>
                    <li>📅 Track vaccination schedules for all your children</li>
                    <li>🔔 Receive timely reminders before appointments</li>
                    <li>📊 View complete vaccination history</li>
                    <li>📱 Get notifications via email, SMS, and push notifications</li>
                    <li>👩‍⚕️ Connect with healthcare providers</li>
                    <li>📈 Monitor vaccination progress</li>
                </ul>
            </div>
            
            <p>Your account has been successfully created with the email: <strong>{{email}}</strong></p>
            
            <div style="text-align: center; margin: 20px 0;">
                <a href="{{loginUrl}}" class="button">Get Started</a>
            </div>
            
            <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
            
            <p>Thank you for choosing our vaccination tracking system to keep your family healthy!</p>
        </div>
        <div class="footer">
            <p>&copy; 2024 Vaccination Tracking System. All rights reserved.</p>
            <p>This email was sent to {{email}}. If you didn't create this account, please ignore this email.</p>
        </div>
    </div>
</body>
</html>`,

      'vaccination-reminder.html': `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Vaccination Reminder</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            margin: 0; 
            padding: 0; 
        }
        .container { 
            max-width: 600px; 
            margin: 0 auto; 
            padding: 20px; 
        }
        .header { 
            background-color: #2196F3; 
            color: white; 
            padding: 20px; 
            text-align: center; 
            border-radius: 8px 8px 0 0;
        }
        .content { 
            padding: 20px; 
            background-color: #f9f9f9; 
            border: 1px solid #ddd;
        }
        .footer { 
            padding: 20px; 
            text-align: center; 
            font-size: 12px; 
            color: #666; 
            background-color: #f1f1f1;
            border-radius: 0 0 8px 8px;
        }
        .reminder-box { 
            background-color: #E3F2FD; 
            padding: 20px; 
            border-left: 4px solid #2196F3; 
            margin: 20px 0; 
            border-radius: 0 4px 4px 0;
        }
        .button { 
            display: inline-block; 
            padding: 12px 24px; 
            background-color: #2196F3; 
            color: white; 
            text-decoration: none; 
            border-radius: 4px; 
            margin: 10px 0;
        }
        .important-info {
            background-color: #FFF3E0;
            padding: 15px;
            border-radius: 4px;
            border-left: 4px solid #FF9800;
            margin: 15px 0;
        }
        .vaccine-details {
            background-color: white;
            padding: 15px;
            border-radius: 4px;
            margin: 15px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🩹 Vaccination Reminder</h1>
        </div>
        <div class="content">
            <h2>Hello {{userName}}!</h2>
            
            <div class="reminder-box">
                <h3>{{notificationTitle}}</h3>
                <p><strong>{{message}}</strong></p>
            </div>

            <div class="vaccine-details">
                <h4>📋 Vaccination Details:</h4>
                <p><strong>Child:</strong> {{childName}}</p>
                <p><strong>Vaccine:</strong> {{vaccineName}}</p>
                <p><strong>Dose Number:</strong> {{doseNumber}}</p>
                <p><strong>Scheduled Date:</strong> {{scheduledDate}}</p>
                <p><strong>Location:</strong> {{location}}</p>
            </div>

            <div class="important-info">
                <h4>⏰ Important Reminders:</h4>
                <ul>
                    <li>Please arrive 15 minutes before your appointment</li>
                    <li>Bring your child's vaccination record</li>
                    <li>Inform the healthcare provider of any recent illness</li>
                    <li>Your child should be fever-free for at least 24 hours</li>
                </ul>
            </div>

            <p>Keeping up with vaccination schedules is crucial for your child's health and the health of the community. Vaccines protect against serious and potentially life-threatening diseases.</p>
            
            <div style="text-align: center; margin: 20px 0;">
                <a href="{{appointmentUrl}}" class="button">View Appointment Details</a>
            </div>

            <p>If you need to reschedule or have any concerns, please contact your healthcare provider as soon as possible.</p>

            <p><strong>Need to contact us?</strong><br>
            📞 Phone: {{supportPhone}}<br>
            📧 Email: {{supportEmail}}</p>
        </div>
        <div class="footer">
            <p>&copy; 2024 Vaccination Tracking System. All rights reserved.</p>
            <p>This reminder was sent to {{email}}. To manage your notification preferences, <a href="{{preferencesUrl}}">click here</a>.</p>
        </div>
    </div>
</body>
</html>`,

      'vaccination-overdue.html': `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Overdue Vaccination Alert</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            margin: 0; 
            padding: 0; 
        }
        .container { 
            max-width: 600px; 
            margin: 0 auto; 
            padding: 20px; 
        }
        .header { 
            background-color: #FF5722; 
            color: white; 
            padding: 20px; 
            text-align: center; 
            border-radius: 8px 8px 0 0;
        }
        .content { 
            padding: 20px; 
            background-color: #f9f9f9; 
            border: 1px solid #ddd;
        }
        .footer { 
            padding: 20px; 
            text-align: center; 
            font-size: 12px; 
            color: #666; 
            background-color: #f1f1f1;
            border-radius: 0 0 8px 8px;
        }
        .alert-box { 
            background-color: #FFEBEE; 
            padding: 20px; 
            border-left: 4px solid #FF5722; 
            margin: 20px 0; 
            border-radius: 0 4px 4px 0;
        }
        .button { 
            display: inline-block; 
            padding: 12px 24px; 
            background-color: #FF5722; 
            color: white; 
            text-decoration: none; 
            border-radius: 4px; 
            margin: 10px 0;
        }
        .urgent-action {
            background-color: #FFE0E0;
            padding: 20px;
            border: 2px solid #FF5722;
            border-radius: 8px;
            margin: 20px 0;
            text-align: center;
        }
        .vaccine-details {
            background-color: white;
            padding: 15px;
            border-radius: 4px;
            margin: 15px 0;
        }
        .consequences {
            background-color: #FFF3E0;
            padding: 15px;
            border-radius: 4px;
            border-left: 4px solid #FF9800;
            margin: 15px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>⚠️ URGENT: Overdue Vaccination Alert</h1>
        </div>
        <div class="content">
            <h2>Hello {{userName}}!</h2>
            
            <div class="alert-box">
                <h3>{{notificationTitle}}</h3>
                <p><strong>{{message}}</strong></p>
            </div>

            <div class="urgent-action">
                <h3>🚨 IMMEDIATE ACTION REQUIRED</h3>
                <p><strong>This vaccination is now {{daysOverdue}} days overdue!</strong></p>
                <p>Please schedule an appointment with your healthcare provider TODAY.</p>
            </div>

            <div class="vaccine-details">
                <h4>📋 Overdue Vaccination Details:</h4>
                <p><strong>Child:</strong> {{childName}}</p>
                <p><strong>Vaccine:</strong> {{vaccineName}}</p>
                <p><strong>Dose Number:</strong> {{doseNumber}}</p>
                <p><strong>Originally Scheduled:</strong> {{originalScheduledDate}}</p>
                <p><strong>Days Overdue:</strong> <span style="color: #FF5722; font-weight: bold;">{{daysOverdue}} days</span></p>
            </div>

            <div class="consequences">
                <h4>⚠️ Why This Matters:</h4>
                <ul>
                    <li><strong>Disease Protection:</strong> Your child is at risk of contracting preventable diseases</li>
                    <li><strong>Community Health:</strong> Unvaccinated children can spread diseases to others</li>
                    <li><strong>School Requirements:</strong> Many schools require up-to-date vaccinations</li>
                    <li><strong>Travel Restrictions:</strong> Some vaccines are required for international travel</li>
                    <li><strong>Future Scheduling:</strong> Delays can disrupt the entire vaccination schedule</li>
                </ul>
            </div>

            <div style="text-align: center; margin: 30px 0;">
                <a href="{{scheduleUrl}}" class="button">Schedule Appointment Now</a>
            </div>

            <div style="background-color: #E8F5E8; padding: 15px; border-radius: 4px; margin: 20px 0;">
                <h4>📞 Need Help Scheduling?</h4>
                <p><strong>Healthcare Provider:</strong> {{doctorName}}<br>
                <strong>Phone:</strong> {{doctorPhone}}<br>
                <strong>Clinic:</strong> {{clinicName}}</p>
                
                <p><strong>Emergency Support:</strong><br>
                📞 Phone: {{supportPhone}}<br>
                📧 Email: {{supportEmail}}</p>
            </div>

            <p><strong>Please don't delay!</strong> The longer you wait, the greater the risk to your child's health and the health of others in your community.</p>

            <p>If there are specific concerns about the vaccine or your child's health condition, please consult with your healthcare provider immediately.</p>
        </div>
        <div class="footer">
            <p>&copy; 2024 Vaccination Tracking System. All rights reserved.</p>
            <p>This urgent alert was sent to {{email}}. This is an automated system notification for your child's health and safety.</p>
        </div>
    </div>
</body>
</html>`,

      'vaccination-completed.html': `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Vaccination Completed Successfully</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            margin: 0; 
            padding: 0; 
        }
        .container { 
            max-width: 600px; 
            margin: 0 auto; 
            padding: 20px; 
        }
        .header { 
            background-color: #4CAF50; 
            color: white; 
            padding: 20px; 
            text-align: center; 
            border-radius: 8px 8px 0 0;
        }
        .content { 
            padding: 20px; 
            background-color: #f9f9f9; 
            border: 1px solid #ddd;
        }
        .footer { 
            padding: 20px; 
            text-align: center; 
            font-size: 12px; 
            color: #666; 
            background-color: #f1f1f1;
            border-radius: 0 0 8px 8px;
        }
        .success-box { 
            background-color: #E8F5E8; 
            padding: 20px; 
            border-left: 4px solid #4CAF50; 
            margin: 20px 0; 
            border-radius: 0 4px 4px 0;
        }
        .button { 
            display: inline-block; 
            padding: 12px 24px; 
            background-color: #4CAF50; 
            color: white; 
            text-decoration: none; 
            border-radius: 4px; 
            margin: 10px 0;
        }
        .vaccination-record {
            background-color: white;
            padding: 20px;
            border-radius: 8px;
            border: 1px solid #ddd;
            margin: 20px 0;
        }
        .next-steps {
            background-color: #E3F2FD;
            padding: 15px;
            border-radius: 4px;
            border-left: 4px solid #2196F3;
            margin: 15px 0;
        }
        .progress-bar {
            background-color: #f0f0f0;
            height: 20px;
            border-radius: 10px;
            overflow: hidden;
            margin: 10px 0;
        }
        .progress-fill {
            background-color: #4CAF50;
            height: 100%;
            transition: width 0.3s ease;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>✅ Vaccination Completed Successfully!</h1>
        </div>
        <div class="content">
            <h2>Congratulations {{userName}}! 🎉</h2>
            
            <div class="success-box">
                <h3>{{notificationTitle}}</h3>
                <p><strong>{{message}}</strong></p>
            </div>

            <div class="vaccination-record">
                <h4>📋 Vaccination Record Details:</h4>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 8px; font-weight: bold;">Child:</td>
                        <td style="padding: 8px;">{{childName}}</td>
                    </tr>
                    <tr style="background-color: #f9f9f9;">
                        <td style="padding: 8px; font-weight: bold;">Vaccine:</td>
                        <td style="padding: 8px;">{{vaccineName}}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; font-weight: bold;">Dose Number:</td>
                        <td style="padding: 8px;">{{doseNumber}}</td>
                    </tr>
                    <tr style="background-color: #f9f9f9;">
                        <td style="padding: 8px; font-weight: bold;">Date Administered:</td>
                        <td style="padding: 8px;">{{administeredDate}}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; font-weight: bold;">Healthcare Provider:</td>
                        <td style="padding: 8px;">{{administeredBy}}</td>
                    </tr>
                    <tr style="background-color: #f9f9f9;">
                        <td style="padding: 8px; font-weight: bold;">Location:</td>
                        <td style="padding: 8px;">{{location}}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; font-weight: bold;">Batch Number:</td>
                        <td style="padding: 8px;">{{batchNumber}}</td>
                    </tr>
                </table>
            </div>

            <div style="text-align: center; margin: 20px 0;">
                <h4>🏆 Vaccination Progress</h4>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: {{completionPercentage}}%;"></div>
                </div>
                <p><strong>{{completionPercentage}}% Complete</strong> ({{completedVaccinations}} of {{totalVaccinations}} vaccinations)</p>
            </div>

            <div class="next-steps">
                <h4>📝 What to Do Next:</h4>
                <ul>
                    <li><strong>Keep Records Safe:</strong> Save this confirmation and update your vaccination card</li>
                    <li><strong>Monitor for Side Effects:</strong> Watch your child for any reactions over the next 24-48 hours</li>
                    <li><strong>Follow-up Care:</strong> Most side effects are mild (fever, soreness, irritability)</li>
                    <li><strong>Next Appointment:</strong> {{nextDueDate ? 'Your next vaccination is scheduled for ' + nextDueDate : 'No upcoming vaccinations at this time'}}</li>
                    <li><strong>Contact Provider:</strong> Call if you notice severe reactions or have concerns</li>
                </ul>
            </div>

            <div style="background-color: #FFF3E0; padding: 15px; border-radius: 4px; margin: 20px 0;">
                <h4>⚠️ Watch for These Side Effects (Normal):</h4>
                <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                    <span style="background-color: #FFE0B2; padding: 5px 10px; border-radius: 15px; font-size: 12px;">Mild Fever</span>
                    <span style="background-color: #FFE0B2; padding: 5px 10px; border-radius: 15px; font-size: 12px;">Injection Site Soreness</span>
                    <span style="background-color: #FFE0B2; padding: 5px 10px; border-radius: 15px; font-size: 12px;">Tiredness</span>
                    <span style="background-color: #FFE0B2; padding: 5px 10px; border-radius: 15px; font-size: 12px;">Mild Fussiness</span>
                </div>
            </div>

            <div style="background-color: #FFEBEE; padding: 15px; border-radius: 4px; margin: 20px 0;">
                <h4>🚨 Call Your Doctor Immediately If:</h4>
                <ul style="color: #D32F2F;">
                    <li>High fever over 104°F (40°C)</li>
                    <li>Severe allergic reaction (difficulty breathing, swelling)</li>
                    <li>Persistent crying for more than 3 hours</li>
                    <li>Seizures or unusual behavior</li>
                </ul>
            </div>

            <div style="text-align: center; margin: 30px 0;">
                <a href="{{vaccinationRecordUrl}}" class="button">View Full Vaccination Record</a>
            </div>

            <p>Thank you for keeping {{childName}} up to date with vaccinations! You're protecting not just your child, but your entire community.</p>

            <div style="background-color: white; padding: 15px; border-radius: 4px; margin: 20px 0;">
                <h4>📞 Contact Information:</h4>
                <p><strong>Healthcare Provider:</strong> {{doctorName}}<br>
                <strong>Phone:</strong> {{doctorPhone}}<br>
                <strong>Clinic:</strong> {{clinicName}}</p>
                
                <p><strong>24/7 Support:</strong><br>
                📞 Phone: {{supportPhone}}<br>
                📧 Email: {{supportEmail}}</p>
            </div>
        </div>
        <div class="footer">
            <p>&copy; 2024 Vaccination Tracking System. All rights reserved.</p>
            <p>This confirmation was sent to {{email}}. Keep this record for your files.</p>
        </div>
    </div>
</body>
</html>`,

      'password-reset.html': `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Password Reset Request</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            margin: 0; 
            padding: 0; 
        }
        .container { 
            max-width: 600px; 
            margin: 0 auto; 
            padding: 20px; 
        }
        .header { 
            background-color: #FF9800; 
            color: white; 
            padding: 20px; 
            text-align: center; 
            border-radius: 8px 8px 0 0;
        }
        .content { 
            padding: 20px; 
            background-color: #f9f9f9; 
            border: 1px solid #ddd;
        }
        .footer { 
            padding: 20px; 
            text-align: center; 
            font-size: 12px; 
            color: #666; 
            background-color: #f1f1f1;
            border-radius: 0 0 8px 8px;
        }
        .button { 
            display: inline-block; 
            padding: 15px 30px; 
            background-color: #FF9800; 
            color: white; 
            text-decoration: none; 
            border-radius: 6px; 
            font-weight: bold;
            margin: 20px 0;
        }
        .security-info {
            background-color: #E3F2FD;
            padding: 15px;
            border-radius: 4px;
            border-left: 4px solid #2196F3;
            margin: 20px 0;
        }
        .warning {
            background-color: #FFEBEE;
            padding: 15px;
            border-radius: 4px;
            border-left: 4px solid #FF5722;
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔐 Password Reset Request</h1>
        </div>
        <div class="content">
            <h2>Hello {{userName}}!</h2>
            
            <p>We received a request to reset the password for your Vaccination Tracking System account associated with <strong>{{email}}</strong>.</p>

            <div class="security-info">
                <h4>🔒 Reset Your Password</h4>
                <p>Click the button below to create a new password for your account. This link will expire in <strong>{{expirationTime}}</strong> for security purposes.</p>
                
                <div style="text-align: center; margin: 25px 0;">
                    <a href="{{resetLink}}" class="button">Reset My Password</a>
                </div>
                
                <p style="font-size: 12px; color: #666;">
                    If the button doesn't work, you can copy and paste this link into your browser:<br>
                    <span style="word-break: break-all;">{{resetLink}}</span>
                </p>
            </div>

            <div class="warning">
                <h4>⚠️ Important Security Information</h4>
                <ul>
                    <li><strong>Didn't request this?</strong> If you didn't ask for a password reset, you can safely ignore this email. Your account is still secure.</li>
                    <li><strong>Link expires:</strong> This reset link will expire in {{expirationTime}} for your security.</li>
                    <li><strong>One-time use:</strong> This link can only be used once to reset your password.</li>
                    <li><strong>Secure connection:</strong> Always make sure you're on the official website when entering your new password.</li>
                </ul>
            </div>

            <div style="background-color: white; padding: 15px; border-radius: 4px; margin: 20px 0;">
                <h4>💡 Tips for Creating a Strong Password:</h4>
                <ul>
                    <li>Use at least 8 characters</li>
                    <li>Include uppercase and lowercase letters</li>
                    <li>Add numbers and special characters (!@#$%^&*)</li>
                    <li>Avoid using personal information</li>
                    <li>Don't reuse passwords from other accounts</li>
                </ul>
            </div>

            <p>If you're having trouble with the password reset process or have any security concerns, please contact our support team immediately.</p>

            <div style="background-color: #F3E5F5; padding: 15px; border-radius: 4px; margin: 20px 0;">
                <h4>📞 Need Help?</h4>
                <p><strong>Support Team:</strong><br>
                📞 Phone: {{supportPhone}}<br>
                📧 Email: {{supportEmail}}<br>
                🕐 Available: Monday - Friday, 9 AM - 5 PM</p>
            </div>

            <p>Thank you for using our Vaccination Tracking System to keep your family healthy and protected.</p>
        </div>
        <div class="footer">
            <p>&copy; 2024 Vaccination Tracking System. All rights reserved.</p>
            <p>This password reset email was sent to {{email}} on {{date}}.</p>
            <p>For security reasons, please do not share this email with anyone.</p>
        </div>
    </div>
</body>
</html>`,

      'appointment-confirmation.html': `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Appointment Confirmation</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            margin: 0; 
            padding: 0; 
        }
        .container { 
            max-width: 600px; 
            margin: 0 auto; 
            padding: 20px; 
        }
        .header { 
            background-color: #9C27B0; 
            color: white; 
            padding: 20px; 
            text-align: center; 
            border-radius: 8px 8px 0 0;
        }
        .content { 
            padding: 20px; 
            background-color: #f9f9f9; 
            border: 1px solid #ddd;
        }
        .footer { 
            padding: 20px; 
            text-align: center; 
            font-size: 12px; 
            color: #666; 
            background-color: #f1f1f1;
            border-radius: 0 0 8px 8px;
        }
        .appointment-details {
            background-color: white;
            padding: 20px;
            border-radius: 8px;
            border: 2px solid #9C27B0;
            margin: 20px 0;
        }
        .button { 
            display: inline-block; 
            padding: 12px 24px; 
            background-color: #9C27B0; 
            color: white; 
            text-decoration: none; 
            border-radius: 4px; 
            margin: 10px 5px;
        }
        .calendar-info {
            background-color: #F3E5F5;
            padding: 15px;
            border-radius: 4px;
            margin: 15px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📅 Appointment Confirmed!</h1>
        </div>
        <div class="content">
            <h2>Hello {{userName}}!</h2>
            
            <p>Your vaccination appointment has been successfully confirmed. Please save this email for your records.</p>

            <div class="appointment-details">
                <h3>📋 Appointment Details</h3>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #eee;">Patient:</td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">{{childName}}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #eee;">Vaccine:</td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">{{vaccineName}}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #eee;">Date:</td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>{{appointmentDate}}</strong></td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #eee;">Time:</td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>{{appointmentTime}}</strong></td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #eee;">Provider:</td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">{{doctorName}}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; font-weight: bold;">Location:</td>
                        <td style="padding: 10px;">{{clinicName}}<br>{{clinicAddress}}</td>
                    </tr>
                </table>
            </div>

            <div class="calendar-info">
                <h4>📱 Add to Your Calendar</h4>
                <p>Don't forget your appointment! Add it to your calendar to get automatic reminders.</p>
                <div style="text-align: center;">
                    <a href="{{googleCalendarUrl}}" class="button">Add to Google Calendar</a>
                    <a href="{{icsFileUrl}}" class="button">Download .ics File</a>
                </div>
            </div>

            <div style="background-color: #E8F5E8; padding: 15px; border-radius: 4px; margin: 20px 0;">
                <h4>✅ Before Your Appointment:</h4>
                <ul>
                    <li>Arrive 15 minutes early for check-in</li>
                    <li>Bring your child's vaccination record/card</li>
                    <li>Bring your insurance card and ID</li>
                    <li>List any current medications your child is taking</li>
                    <li>Note any recent illness or fever</li>
                    <li>Prepare any questions for the healthcare provider</li>
                </ul>
            </div>

            <div style="text-align: center; margin: 30px 0;">
                <a href="{{rescheduleUrl}}" class="button">Need to Reschedule?</a>
                <a href="{{cancelUrl}}" class="button" style="background-color: #757575;">Cancel Appointment</a>
            </div>

            <div style="background-color: white; padding: 15px; border-radius: 4px; margin: 20px 0;">
                <h4>📞 Contact Information:</h4>
                <p><strong>{{clinicName}}</strong><br>
                📍 {{clinicAddress}}<br>
                📞 Phone: {{clinicPhone}}<br>
                🕐 Hours: {{clinicHours}}</p>
            </div>
        </div>
        <div class="footer">
            <p>&copy; 2024 Vaccination Tracking System. All rights reserved.</p>
            <p>Confirmation sent to {{email}} on {{date}}</p>
        </div>
    </div>
</body>
</html>`,

      'default-notification.html': `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{{notificationTitle}}</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            margin: 0; 
            padding: 0; 
        }
        .container { 
            max-width: 600px; 
            margin: 0 auto; 
            padding: 20px; 
        }
        .header { 
            background-color: #607D8B; 
            color: white; 
            padding: 20px; 
            text-align: center; 
            border-radius: 8px 8px 0 0;
        }
        .content { 
            padding: 20px; 
            background-color: #f9f9f9; 
            border: 1px solid #ddd;
        }
        .footer { 
            padding: 20px; 
            text-align: center; 
            font-size: 12px; 
            color: #666; 
            background-color: #f1f1f1;
            border-radius: 0 0 8px 8px;
        }
        .message-box {
            background-color: white;
            padding: 20px;
            border-radius: 4px;
            margin: 15px 0;
            border-left: 4px solid #607D8B;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📧 {{notificationTitle}}</h1>
        </div>
        <div class="content">
            <h2>Hello {{userName}}!</h2>
            
            <div class="message-box">
                <p>{{message}}</p>
            </div>

            <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>

            <div style="background-color: white; padding: 15px; border-radius: 4px; margin: 20px 0;">
                <h4>📞 Contact Support:</h4>
                <p>📞 Phone: {{supportPhone}}<br>
                📧 Email: {{supportEmail}}</p>
            </div>
        </div>
        <div class="footer">
            <p>&copy; 2024 Vaccination Tracking System. All rights reserved.</p>
            <p>This notification was sent to {{email}} on {{date}}</p>
        </div>
    </div>
</body>
</html>`
    };

    // Write template files
    for (const [filename, content] of Object.entries(templates)) {
      const filePath = path.join(templatesDir, filename);
      await fs.writeFile(filePath, content, 'utf-8');
    }

    logger.info('Default email templates created');
  }

  /**
   * Create basic templates in memory as fallback
   */
  createBasicTemplates() {
    const basicTemplates = {
      'welcome': `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #4CAF50;">Welcome {{userName}}!</h1>
          <p>Welcome to our vaccination tracking system.</p>
          <p>Your account has been created with email: {{email}}</p>
        </div>
      `,
      'vaccination-reminder': `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #2196F3;">Vaccination Reminder</h1>
          <h2>Hello {{userName}}!</h2>
          <div style="background-color: #E3F2FD; padding: 15px; border-left: 4px solid #2196F3;">
            <p><strong>{{notificationTitle}}</strong></p>
            <p>{{message}}</p>
          </div>
        </div>
      `,
      'vaccination-overdue': `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #FF5722;">⚠️ Overdue Vaccination Alert</h1>
          <h2>Hello {{userName}}!</h2>
          <div style="background-color: #FFEBEE; padding: 15px; border-left: 4px solid #FF5722;">
            <p><strong>{{notificationTitle}}</strong></p>
            <p>{{message}}</p>
          </div>
          <p><strong>Please schedule an appointment as soon as possible.</strong></p>
        </div>
      `,
      'vaccination-completed': `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #4CAF50;">✅ Vaccination Completed</h1>
          <h2>Hello {{userName}}!</h2>
          <div style="background-color: #E8F5E8; padding: 15px; border-left: 4px solid #4CAF50;">
            <p><strong>{{notificationTitle}}</strong></p>
            <p>{{message}}</p>
          </div>
          <p>Thank you for keeping your child's vaccinations up to date!</p>
        </div>
      `,
      'password-reset': `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #FF9800;">🔐 Password Reset Request</h1>
          <h2>Hello {{userName}}!</h2>
          <p>We received a request to reset your password.</p>
          <div style="text-align: center; margin: 20px 0;">
            <a href="{{resetLink}}" style="background-color: #FF9800; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Reset Password</a>
          </div>
          <p>This link will expire in {{expirationTime}}.</p>
        </div>
      `,
      'default-notification': `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1>{{notificationTitle}}</h1>
          <h2>Hello {{userName}}!</h2>
          <p>{{message}}</p>
        </div>
      `
    };

    for (const [name, template] of Object.entries(basicTemplates)) {
      this.templates.set(name, template);
    }

    logger.info('Basic email templates loaded in memory');
  }

  /**
   * Send email
   * @param {Object} options - Email options
   * @returns {Object} Send result
   */
  async sendEmail(options) {
    try {
      const { to, subject, template, data, html, text, attachments } = options;

      if (!to || !subject) {
        throw new Error('Email recipient and subject are required');
      }

      // Validate email address
      if (!this.isValidEmail(to)) {
        throw new Error('Invalid email address');
      }

      let emailHtml = html;
      let emailText = text;

      // Use template if provided
      if (template && this.templates.has(template)) {
        emailHtml = this.renderTemplate(template, data || {});
        emailText = this.stripHtml(emailHtml);
      }

      const mailOptions = {
        from: {
          name: process.env.EMAIL_FROM_NAME || 'Vaccination Tracking System',
          address: process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_USER
        },
        to,
        subject,
        html: emailHtml,
        text: emailText
      };

      // Add attachments if provided
      if (attachments) {
        mailOptions.attachments = attachments;
      }

      const result = await this.transporter.sendMail(mailOptions);
      
      logger.info(`Email sent successfully to ${to}: ${subject}`);
      
      return {
        success: true,
        messageId: result.messageId,
        recipient: to,
        subject
      };

    } catch (error) {
      logger.error('Failed to send email:', error);
      throw error;
    }
  }

  /**
   * Send bulk emails
   * @param {Array} emails - Array of email options
   * @returns {Array} Send results
   */
  async sendBulkEmails(emails) {
    const results = [];
    const batchSize = 10; // Send in batches to avoid overwhelming the server

    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      const batchPromises = batch.map(async (emailOptions) => {
        try {
          const result = await this.sendEmail(emailOptions);
          return { success: true, result, email: emailOptions.to };
        } catch (error) {
          logger.error(`Failed to send bulk email to ${emailOptions.to}:`, error);
          return { 
            success: false, 
            error: error.message, 
            email: emailOptions.to 
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Add delay between batches to respect rate limits
      if (i + batchSize < emails.length) {
        await this.sleep(1000); // 1 second delay
      }
    }

    const successCount = results.filter(r => r.success).length;
    logger.info(`Bulk email send completed: ${successCount}/${emails.length} successful`);

    return results;
  }

  /**
   * Render email template with data
   * @param {String} templateName - Template name
   * @param {Object} data - Template data
   * @returns {String} Rendered template
   */
  renderTemplate(templateName, data) {
    if (!this.templates.has(templateName)) {
      logger.warn(`Template '${templateName}' not found, using default`);
      templateName = 'default-notification';
    }

    let template = this.templates.get(templateName);

    // Set default values
    const templateData = {
      userName: 'User',
      email: '',
      date: formatDate(new Date(), 'MMMM Do, YYYY'),
      supportPhone: process.env.SUPPORT_PHONE || '+1-800-VACCINE',
      supportEmail: process.env.SUPPORT_EMAIL || 'support@vaccination-tracking.com',
      loginUrl: `${process.env.FRONTEND_URL}/login`,
      preferencesUrl: `${process.env.FRONTEND_URL}/preferences`,
      ...data
    };

    // Replace template variables
    for (const [key, value] of Object.entries(templateData)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      template = template.replace(regex, value || '');
    }

    // Clean up any remaining template variables
    template = template.replace(/{{[^}]+}}/g, '');

    return template;
  }

  /**
   * Strip HTML tags from text
   * @param {String} html - HTML string
   * @returns {String} Plain text
   */
  stripHtml(html) {
    return html
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
      .replace(/&amp;/g, '&') // Replace &amp; with &
      .replace(/&lt;/g, '<') // Replace &lt; with <
      .replace(/&gt;/g, '>') // Replace &gt; with >
      .replace(/&quot;/g, '"') // Replace &quot; with "
      .replace(/&#39;/g, "'") // Replace &#39; with '
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim();
  }

  /**
   * Validate email address
   * @param {String} email - Email address
   * @returns {Boolean} Is valid
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Send welcome email
   * @param {Object} user - User object
   * @returns {Object} Send result
   */
  async sendWelcomeEmail(user) {
    return await this.sendEmail({
      to: user.email,
      subject: 'Welcome to Vaccination Tracking System',
      template: 'welcome',
      data: {
        userName: `${user.firstName} ${user.lastName}`,
        email: user.email
      }
    });
  }

  /**
   * Send password reset email
   * @param {Object} user - User object
   * @param {String} resetToken - Reset token
   * @returns {Object} Send result
   */
  async sendPasswordResetEmail(user, resetToken) {
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    
    return await this.sendEmail({
      to: user.email,
      subject: 'Password Reset Request - Vaccination Tracking System',
      template: 'password-reset',
      data: {
        userName: `${user.firstName} ${user.lastName}`,
        email: user.email,
        resetLink,
        expirationTime: '1 hour'
      }
    });
  }

  /**
   * Send appointment confirmation email
   * @param {Object} user - User object
   * @param {Object} appointmentData - Appointment details
   * @returns {Object} Send result
   */
  async sendAppointmentConfirmation(user, appointmentData) {
    return await this.sendEmail({
      to: user.email,
      subject: `Appointment Confirmed - ${appointmentData.childName}`,
      template: 'appointment-confirmation',
      data: {
        userName: `${user.firstName} ${user.lastName}`,
        email: user.email,
        ...appointmentData
      }
    });
  }

  /**
   * Send vaccination summary email
   * @param {Object} user - User object
   * @param {Object} summaryData - Summary data
   * @returns {Object} Send result
   */
  async sendVaccinationSummary(user, summaryData) {
    return await this.sendEmail({
      to: user.email,
      subject: 'Monthly Vaccination Summary',
      template: 'vaccination-summary',
      data: {
        userName: `${user.firstName} ${user.lastName}`,
        email: user.email,
        ...summaryData
      }
    });
  }

  /**
   * Test email configuration
   * @param {String} testEmail - Test email address (optional)
   * @returns {Object} Test result
   */
  async testEmailConfiguration(testEmail = null) {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      await this.transporter.verify();

      // Send test email if address provided
      if (testEmail) {
        await this.sendEmail({
          to: testEmail,
          subject: 'Test Email - Vaccination Tracking System',
          template: 'default-notification',
          data: {
            notificationTitle: 'Email Configuration Test',
            message: `This is a test email sent at ${formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss')} to verify your email configuration is working correctly.`
          }
        });
      }

      return {
        success: true,
        message: 'Email configuration is valid',
        testEmailSent: !!testEmail,
        service: process.env.EMAIL_SERVICE,
        host: process.env.EMAIL_HOST
      };

    } catch (error) {
      logger.error('Email configuration test failed:', error);
      return {
        success: false,
        message: 'Email configuration test failed',
        error: error.message
      };
    }
  }

  /**
   * Get email statistics
   * @returns {Object} Email statistics
   */
  getEmailStatistics() {
    return {
      templatesLoaded: this.templates.size,
      availableTemplates: Array.from(this.templates.keys()),
      isInitialized: !!this.transporter,
      service: process.env.EMAIL_SERVICE,
      fromAddress: process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_USER
    };
  }

  /**
   * Reload email templates
   * @returns {Object} Reload result
   */
  async reloadTemplates() {
    try {
      this.templates.clear();
      await this.loadTemplates();
      
      return {
        success: true,
        message: 'Email templates reloaded successfully',
        templatesLoaded: this.templates.size
      };
    } catch (error) {
      logger.error('Failed to reload email templates:', error);
      return {
        success: false,
        message: 'Failed to reload email templates',
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
   * Close email service
   */
  close() {
    if (this.transporter) {
      this.transporter.close();
      logger.info('Email service closed');
    }
  }
}

module.exports = new EmailService();