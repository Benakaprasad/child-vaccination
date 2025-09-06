const mongoose = require('mongoose');
const { VACCINATION_STATUS } = require('../utils/constants');

// Check if model already exists to prevent overwrite error
if (mongoose.models.VaccinationRecord) {
  module.exports = mongoose.models.VaccinationRecord;
} else {
  const vaccinationRecordSchema = new mongoose.Schema({
    childId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Child',
      required: [true, 'Child ID is required']
    },
    vaccineId: {
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
    completedDate: {
      type: Date,
      default: null
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
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

  // Compound indexes for better performance
  vaccinationRecordSchema.index({ childId: 1, status: 1 });
  vaccinationRecordSchema.index({ scheduledDate: 1, status: 1 });
  vaccinationRecordSchema.index({ vaccineId: 1, status: 1 });
  vaccinationRecordSchema.index({ doctorId: 1 });
  vaccinationRecordSchema.index({ status: 1, scheduledDate: 1 });

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

  // Static methods
  vaccinationRecordSchema.statics.findByChild = function(childId, status = null) {
    const query = { childId };
    if (status) query.status = status;
    return this.find(query)
      .populate('vaccineId', 'name description category')
      .populate('doctorId', 'name phone email')
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
      query.childId = { $in: childIds };
    }
    
    return this.find(query)
      .populate('childId', 'name dob parentId')
      .populate('vaccineId', 'name description')
      .populate('doctorId', 'name')
      .sort({ scheduledDate: 1 });
  };

  vaccinationRecordSchema.statics.findOverdue = function(childIds = null) {
    const query = {
      status: VACCINATION_STATUS.SCHEDULED,
      scheduledDate: { $lt: new Date() }
    };
    
    if (childIds) {
      query.childId = { $in: childIds };
    }
    
    return this.find(query)
      .populate('childId', 'name dob parentId')
      .populate('vaccineId', 'name description')
      .populate('doctorId', 'name')
      .sort({ scheduledDate: 1 });
  };

  vaccinationRecordSchema.statics.findCompleted = function(childId, vaccineId = null) {
    const query = {
      childId,
      status: VACCINATION_STATUS.COMPLETED
    };
    
    if (vaccineId) query.vaccineId = vaccineId;
    
    return this.find(query)
      .populate('vaccineId', 'name description')
      .populate('doctorId', 'name')
      .sort({ completedDate: -1 });
  };

  // Instance methods
  vaccinationRecordSchema.methods.markCompleted = function(doctorId = null, completionData = {}) {
    this.status = VACCINATION_STATUS.COMPLETED;
    this.completedDate = completionData.completedDate || new Date();
    
    if (doctorId) this.doctorId = doctorId;
    if (completionData.batchNumber) this.batchNumber = completionData.batchNumber;
    if (completionData.lotNumber) this.lotNumber = completionData.lotNumber;
    if (completionData.administrationSite) this.administrationSite = completionData.administrationSite;
    if (completionData.reactions) this.reactions = completionData.reactions;
    if (completionData.notes) this.notes = completionData.notes;
    
    return this.save();
  };

  vaccinationRecordSchema.methods.reschedule = function(newDate, reason = null) {
    if (!this.originalScheduledDate) {
      this.originalScheduledDate = this.scheduledDate;
    }
    
    this.scheduledDate = newDate;
    this.isDelayed = true;
    
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
    if (this.isModified('status') && this.status === VACCINATION_STATUS.COMPLETED && !this.completedDate) {
      this.completedDate = new Date();
    }
    
    // Reset completed date if status is not completed
    if (this.isModified('status') && this.status !== VACCINATION_STATUS.COMPLETED) {
      this.completedDate = null;
    }
    
    next();
  });

  // Ensure virtual fields are serialized
  vaccinationRecordSchema.set('toJSON', { virtuals: true });
  vaccinationRecordSchema.set('toObject', { virtuals: true });

  module.exports = mongoose.model('VaccinationRecord', vaccinationRecordSchema);
}