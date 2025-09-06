const mongoose = require('mongoose');

// Prevent model overwrite error
const MODEL_NAME = 'Notification';

if (mongoose.models[MODEL_NAME]) {
  module.exports = mongoose.models[MODEL_NAME];
} else {
  const notificationSchema = new mongoose.Schema({
    // User who will receive the notification
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
      index: true
    },
    
    // Type of notification
    type: {
      type: String,
      enum: [
        'vaccination_reminder',
        'vaccination_overdue',
        'vaccination_completed',
        'vaccination_scheduled',
        'vaccination_cancelled',
        'vaccination_rescheduled',
        'system_alert',
        'general_info'
      ],
      required: [true, 'Notification type is required'],
      index: true
    },
    
    // Notification title
    title: {
      type: String,
      required: [true, 'Title is required'],
      maxlength: [200, 'Title cannot exceed 200 characters'],
      trim: true
    },
    
    // Notification message/body
    message: {
      type: String,
      required: [true, 'Message is required'],
      maxlength: [1000, 'Message cannot exceed 1000 characters'],
      trim: true
    },
    
    // Related vaccination record (if applicable)
    vaccinationRecord: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VaccinationRecord',
      default: null,
      index: true
    },
    
    // Related child (if applicable)
    child: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Child',
      default: null,
      index: true
    },
    
    // Priority level
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
      index: true
    },
    
    // Delivery methods and status
    delivery: {
      email: {
        enabled: { type: Boolean, default: true },
        sent: { type: Boolean, default: false },
        sentAt: Date,
        delivered: { type: Boolean, default: false },
        deliveredAt: Date,
        failureReason: String
      },
      sms: {
        enabled: { type: Boolean, default: false },
        sent: { type: Boolean, default: false },
        sentAt: Date,
        delivered: { type: Boolean, default: false },
        deliveredAt: Date,
        failureReason: String
      },
      push: {
        enabled: { type: Boolean, default: true },
        sent: { type: Boolean, default: false },
        sentAt: Date,
        delivered: { type: Boolean, default: false },
        deliveredAt: Date,
        failureReason: String
      }
    },
    
    // Overall status
    status: {
      type: String,
      enum: ['pending', 'sent', 'delivered', 'failed', 'read'],
      default: 'pending',
      index: true
    },
    
    // When notification should be sent (for scheduled notifications)
    scheduledFor: {
      type: Date,
      index: true
    },
    
    // Read status
    isRead: {
      type: Boolean,
      default: false,
      index: true
    },
    
    readAt: {
      type: Date
    },
    
    // Expiration date (after which notification becomes irrelevant)
    expiresAt: {
      type: Date,
      index: true
    },
    
    // Additional data/context
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    
    // Retry information for failed notifications
    retryCount: {
      type: Number,
      default: 0,
      max: [5, 'Maximum 5 retry attempts allowed']
    },
    
    lastRetryAt: {
      type: Date
    },
    
    nextRetryAt: {
      type: Date,
      index: true
    },
    
    // Created by (system or user)
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    
    // Tags for categorization
    tags: [{
      type: String,
      trim: true
    }],
    
    // Action buttons/links
    actions: [{
      label: {
        type: String,
        required: true,
        maxlength: 50
      },
      url: String,
      action: String, // 'reschedule', 'confirm', 'cancel', etc.
      style: {
        type: String,
        enum: ['primary', 'secondary', 'warning', 'danger'],
        default: 'primary'
      }
    }]
  }, {
    timestamps: true
  });

  // Indexes for performance
  notificationSchema.index({ user: 1, status: 1 });
  notificationSchema.index({ user: 1, isRead: 1 });
  notificationSchema.index({ user: 1, type: 1 });
  notificationSchema.index({ scheduledFor: 1, status: 1 });
  notificationSchema.index({ expiresAt: 1 });
  notificationSchema.index({ nextRetryAt: 1, status: 1 });
  notificationSchema.index({ createdAt: -1 });
  
  // Compound indexes
  notificationSchema.index({ user: 1, vaccinationRecord: 1 });
  notificationSchema.index({ user: 1, child: 1 });

  // Virtual for overall delivery status
  notificationSchema.virtual('isDelivered').get(function() {
    return this.delivery.email.delivered || 
           this.delivery.sms.delivered || 
           this.delivery.push.delivered;
  });

  // Virtual for any delivery method sent
  notificationSchema.virtual('isSent').get(function() {
    return this.delivery.email.sent || 
           this.delivery.sms.sent || 
           this.delivery.push.sent;
  });

  // Virtual for time until expiration
  notificationSchema.virtual('timeUntilExpiration').get(function() {
    if (!this.expiresAt) return null;
    return this.expiresAt.getTime() - Date.now();
  });

  // Static methods
  notificationSchema.statics.findPendingForUser = function(userId) {
    return this.find({
      user: userId,
      status: { $in: ['pending', 'sent'] },
      $or: [
        { expiresAt: { $gt: new Date() } },
        { expiresAt: null }
      ]
    }).sort({ priority: -1, createdAt: -1 });
  };

  notificationSchema.statics.findUnreadForUser = function(userId) {
    return this.find({
      user: userId,
      isRead: false,
      $or: [
        { expiresAt: { $gt: new Date() } },
        { expiresAt: null }
      ]
    }).sort({ priority: -1, createdAt: -1 });
  };

  notificationSchema.statics.findScheduledNotifications = function() {
    return this.find({
      status: 'pending',
      scheduledFor: { $lte: new Date() },
      $or: [
        { expiresAt: { $gt: new Date() } },
        { expiresAt: null }
      ]
    });
  };

  notificationSchema.statics.findFailedNotifications = function() {
    return this.find({
      status: 'failed',
      retryCount: { $lt: 5 },
      nextRetryAt: { $lte: new Date() }
    });
  };

  notificationSchema.statics.cleanup = function(daysOld = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    return this.deleteMany({
      $or: [
        { expiresAt: { $lt: new Date() } },
        { 
          isRead: true, 
          status: 'delivered',
          createdAt: { $lt: cutoffDate }
        }
      ]
    });
  };

  // Instance methods
  notificationSchema.methods.markAsRead = function() {
    this.isRead = true;
    this.readAt = new Date();
    if (this.status === 'sent' || this.status === 'delivered') {
      this.status = 'read';
    }
    return this.save();
  };

  notificationSchema.methods.markAsDelivered = function(method = 'email') {
    if (this.delivery[method]) {
      this.delivery[method].delivered = true;
      this.delivery[method].deliveredAt = new Date();
      
      if (this.status !== 'read') {
        this.status = 'delivered';
      }
    }
    return this.save();
  };

  notificationSchema.methods.markAsSent = function(method = 'email') {
    if (this.delivery[method]) {
      this.delivery[method].sent = true;
      this.delivery[method].sentAt = new Date();
      
      if (this.status === 'pending') {
        this.status = 'sent';
      }
    }
    return this.save();
  };

  notificationSchema.methods.markAsFailed = function(method = 'email', reason = '') {
    if (this.delivery[method]) {
      this.delivery[method].failureReason = reason;
    }
    
    this.status = 'failed';
    this.retryCount += 1;
    this.lastRetryAt = new Date();
    
    // Calculate next retry time (exponential backoff)
    const retryDelay = Math.pow(2, this.retryCount) * 60 * 1000; // Minutes in milliseconds
    this.nextRetryAt = new Date(Date.now() + retryDelay);
    
    return this.save();
  };

  notificationSchema.methods.scheduleRetry = function(delayMinutes = 30) {
    this.nextRetryAt = new Date(Date.now() + (delayMinutes * 60 * 1000));
    return this.save();
  };

  // Pre-save middleware
  notificationSchema.pre('save', function(next) {
    // Auto-expire old notifications if not set
    if (!this.expiresAt && this.type === 'vaccination_reminder') {
      // Vaccination reminders expire 1 day after scheduled date
      if (this.vaccinationRecord) {
        // This would need to be populated to access scheduledDate
        // Or you could set a default expiration period
        const oneWeek = 7 * 24 * 60 * 60 * 1000;
        this.expiresAt = new Date(Date.now() + oneWeek);
      }
    }
    
    // Set scheduled time if not provided
    if (!this.scheduledFor && this.status === 'pending') {
      this.scheduledFor = new Date();
    }
    
    next();
  });

  // Ensure virtual fields are serialized
  notificationSchema.set('toJSON', { virtuals: true });
  notificationSchema.set('toObject', { virtuals: true });

  module.exports = mongoose.model(MODEL_NAME, notificationSchema);
}