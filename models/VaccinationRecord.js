const mongoose = require('mongoose');
const { VACCINATION_STATUS } = require('../utils/constants');

// Prevent model overwrite error
const MODEL_NAME = 'VaccinationRecord';

if (mongoose.models[MODEL_NAME]) {
  module.exports = mongoose.models[MODEL_NAME];
} else {
  const vaccinationRecordSchema = new mongoose.Schema({
    // CHANGED: childId -> child to match controller expectations
    child: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Child',
      required: [true, 'Child ID is required']
    },
    // CHANGED: vaccineId -> vaccine to match controller expectations
    vaccine: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vaccine',
      required: [true, 'Vaccine ID is required']
    },
    status: {
      type: String,
      enum: Object.values(VACCINATION_STATUS),
      default: VACCINATION_STATUS.SCHEDULED
    },
    scheduledDate: {
      type: Date,
      required: [true, 'Scheduled date is required']
    },
    // CHANGED: completedDate -> administeredDate to match controller
    administeredDate: {
      type: Date,
      default: null
    },
    // CHANGED: doctorId -> createdBy to match controller
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Creator is required']
    },
    // ADDED: Fields that controller expects
    administeredBy: {
      type: String
    },
    location: {
      type: String
    },
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    completedAt: {
      type: Date
    },
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    lastModifiedAt: {
      type: Date
    },
    cancellationReason: {
      type: String
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    cancelledAt: {
      type: Date
    },
    missedReason: {
      type: String
    },
    missedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    missedAt: {
      type: Date
    },
    rescheduleHistory: [{
      oldDate: Date,
      newDate: Date,
      reason: String,
      rescheduledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      rescheduledAt: Date
    }],
    clinicInfo: {
      name: String,
      address: String,
      phone: String
    },
    dose: {
      type: String,
      required: [true, 'Dose information is required'],
      trim: true
    },
    doseNumber: {
      type: Number,
      min: [1, 'Dose number must be at least 1']
    },
    batchNumber: {
      type: String,
      trim: true
    },
    lotNumber: {
      type: String,
      trim: true
    },
    expirationDate: {
      type: Date
    },
    manufacturer: {
      type: String,
      trim: true
    },
    administrationSite: {
      type: String,
      enum: ['left-arm', 'right-arm', 'left-thigh', 'right-thigh', 'oral', 'nasal'],
      default: 'left-arm'
    },
    routeOfAdministration: {
      type: String,
      enum: ['intramuscular', 'subcutaneous', 'oral', 'nasal', 'intradermal'],
      default: 'intramuscular'
    },
    notes: {
      type: String,
      maxlength: [500, 'Notes cannot be more than 500 characters']
    },
    // CHANGED: reactions -> sideEffects to match controller
    sideEffects: [{
      type: String
    }],
    // ADDED: sideEffectsReports that controller expects
    sideEffectsReports: [{
      effects: [String],
      severity: {
        type: String,
        enum: ['mild', 'moderate', 'severe'],
        default: 'mild'
      },
      notes: String,
      reportedDate: Date,
      reportedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }],
    reactions: [{
      type: {
        type: String,
        required: true,
        trim: true
      },
      description: String,
      severity: {
        type: String,
        enum: ['mild', 'moderate', 'severe'],
        default: 'mild'
      },
      onsetTime: {
        type: Date,
        default: Date.now
      },
      duration: String, // e.g., "2 hours", "1 day"
      treatment: String,
      resolved: {
        type: Boolean,
        default: false
      }
    }],
    followUpRequired: {
      type: Boolean,
      default: false
    },
    followUpDate: {
      type: Date
    },
    followUpNotes: String,
    parentConsent: {
      given: {
        type: Boolean,
        default: true
      },
      date: {
        type: Date,
        default: Date.now
      },
      signature: String // Could store digital signature or confirmation
    },
    remindersSent: [{
      type: {
        type: String,
        enum: ['email', 'sms', 'push']
      },
      sentAt: {
        type: Date,
        default: Date.now
      },
      delivered: {
        type: Boolean,
        default: false
      }
    }],
    isDelayed: {
      type: Boolean,
      default: false
    },
    delayReason: String,
    originalScheduledDate: Date,
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium'
    }
  }, {
    timestamps: true
  });

  // UPDATED: Compound indexes for better performance (changed field names)
  vaccinationRecordSchema.index({ child: 1, status: 1 });
  vaccinationRecordSchema.index({ scheduledDate: 1, status: 1 });
  vaccinationRecordSchema.index({ vaccine: 1, status: 1 });
  vaccinationRecordSchema.index({ createdBy: 1 });
  vaccinationRecordSchema.index({ status: 1, scheduledDate: 1 });
  vaccinationRecordSchema.index({ child: 1, vaccine: 1, doseNumber: 1 });

  // Virtual for days until scheduled
  vaccinationRecordSchema.virtual('daysUntilScheduled').get(function() {
    if (!this.scheduledDate) return null;
    const today = new Date();
    const diffTime = this.scheduledDate - today;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  });

  // Virtual for is overdue
  vaccinationRecordSchema.virtual('isOverdue').get(function() {
    if (this.status !== VACCINATION_STATUS.SCHEDULED) return false;
    return this.scheduledDate < new Date();
  });

  // Virtual for days overdue
  vaccinationRecordSchema.virtual('daysOverdue').get(function() {
    if (!this.isOverdue) return 0;
    const today = new Date();
    const diffTime = today - this.scheduledDate;
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  });

  // UPDATED: Static methods (changed field names)
  vaccinationRecordSchema.statics.findByChild = function(childId, status = null) {
    const query = { child: childId };
    if (status) query.status = status;
    return this.find(query)
      .populate('vaccine', 'name description category')
      .populate('createdBy', 'name phone email')
      .sort({ scheduledDate: 1 });
  };

  vaccinationRecordSchema.statics.findUpcoming = function(days = 30, childIds = null) {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);
    
    const query = {
      status: VACCINATION_STATUS.SCHEDULED,
      scheduledDate: { 
        $gte: new Date(),
        $lte: endDate
      }
    };
    
    if (childIds) {
      query.child = { $in: childIds };
    }
    
    return this.find(query)
      .populate('child', 'firstName lastName dateOfBirth parent')
      .populate('vaccine', 'name description')
      .populate('createdBy', 'firstName lastName')
      .sort({ scheduledDate: 1 });
  };

  vaccinationRecordSchema.statics.findOverdue = function(childIds = null) {
    const query = {
      status: VACCINATION_STATUS.SCHEDULED,
      scheduledDate: { $lt: new Date() }
    };
    
    if (childIds) {
      query.child = { $in: childIds };
    }
    
    return this.find(query)
      .populate('child', 'firstName lastName dateOfBirth parent')
      .populate('vaccine', 'name description')
      .populate('createdBy', 'firstName lastName')
      .sort({ scheduledDate: 1 });
  };

  vaccinationRecordSchema.statics.findCompleted = function(childId, vaccineId = null) {
    const query = {
      child: childId,
      status: VACCINATION_STATUS.COMPLETED
    };
    
    if (vaccineId) query.vaccine = vaccineId;
    
    return this.find(query)
      .populate('vaccine', 'name description')
      .populate('createdBy', 'firstName lastName')
      .sort({ administeredDate: -1 });
  };

  // UPDATED: Instance methods (changed field names and logic to match controller)
  vaccinationRecordSchema.methods.markCompleted = function(createdById = null, completionData = {}) {
    this.status = VACCINATION_STATUS.COMPLETED;
    this.administeredDate = completionData.administeredDate || new Date();
    this.completedAt = new Date();
    
    if (createdById) this.completedBy = createdById;
    if (completionData.administeredBy) this.administeredBy = completionData.administeredBy;
    if (completionData.location) this.location = completionData.location;
    if (completionData.batchNumber) this.batchNumber = completionData.batchNumber;
    if (completionData.lotNumber) this.lotNumber = completionData.lotNumber;
    if (completionData.administrationSite) this.administrationSite = completionData.administrationSite;
    if (completionData.reactions) this.reactions = completionData.reactions;
    if (completionData.sideEffects) this.sideEffects = completionData.sideEffects;
    if (completionData.notes) this.notes = completionData.notes;
    
    return this.save();
  };

  vaccinationRecordSchema.methods.reschedule = function(newDate, reason = null) {
    if (!this.originalScheduledDate) {
      this.originalScheduledDate = this.scheduledDate;
    }
    
    // Add to reschedule history
    const rescheduleEntry = {
      oldDate: this.scheduledDate,
      newDate: newDate,
      reason: reason,
      rescheduledAt: new Date()
    };
    
    if (!this.rescheduleHistory) this.rescheduleHistory = [];
    this.rescheduleHistory.push(rescheduleEntry);
    
    this.scheduledDate = newDate;
    this.isDelayed = true;
    this.status = VACCINATION_STATUS.SCHEDULED;
    
    if (reason) {
      this.delayReason = reason;
    }
    
    return this.save();
  };

  vaccinationRecordSchema.methods.addReaction = function(reactionData) {
    this.reactions.push(reactionData);
    return this.save();
  };

  // Pre-save middleware
  vaccinationRecordSchema.pre('save', function(next) {
    // Auto-set completion date when status changes to completed
    if (this.isModified('status') && this.status === VACCINATION_STATUS.COMPLETED && !this.administeredDate) {
      this.administeredDate = new Date();
      this.completedAt = new Date();
    }
    
    // Reset completed date if status is not completed
    if (this.isModified('status') && this.status !== VACCINATION_STATUS.COMPLETED) {
      this.administeredDate = null;
      this.completedAt = null;
    }
    
    // Update lastModifiedAt
    if (this.isModified() && !this.isNew) {
      this.lastModifiedAt = new Date();
    }
    
    next();
  });

  // Ensure virtual fields are serialized
  vaccinationRecordSchema.set('toJSON', { virtuals: true });
  vaccinationRecordSchema.set('toObject', { virtuals: true });

  module.exports = mongoose.model(MODEL_NAME, vaccinationRecordSchema);
}