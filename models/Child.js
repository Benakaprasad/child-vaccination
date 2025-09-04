const mongoose = require('mongoose');
const moment = require('moment');

const childSchema = new mongoose.Schema({
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Parent ID is required']
  },
  name: {
    type: String,
    required: [true, 'Child name is required'],
    trim: true,
    maxlength: [100, 'Name cannot be more than 100 characters']
  },
  dob: {
    type: Date,
    required: [true, 'Date of birth is required'],
    validate: {
      validator: function(value) {
        return value <= new Date();
      },
      message: 'Date of birth cannot be in the future'
    }
  },
  gender: {
    type: String,
    enum: {
      values: ['male', 'female', 'other'],
      message: 'Gender must be male, female, or other'
    },
    required: [true, 'Gender is required']
  },
  profileImage: {
    type: String,
    default: null
  },
  birthWeight: {
    type: Number,
    min: [0, 'Birth weight must be positive']
  },
  birthHeight: {
    type: Number,
    min: [0, 'Birth height must be positive']
  },
  bloodType: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
    uppercase: true
  },
  medicalInfo: {
    allergies: [{
      type: String,
      trim: true
    }],
    conditions: [{
      type: String,
      trim: true
    }],
    medications: [{
      name: {
        type: String,
        required: true,
        trim: true
      },
      dosage: String,
      frequency: String,
      startDate: Date,
      endDate: Date,
      prescribedBy: String
    }],
    emergencyContacts: [{
      name: {
        type: String,
        required: true,
        trim: true
      },
      relationship: {
        type: String,
        required: true,
        trim: true
      },
      phone: {
        type: String,
        required: true,
        match: [/^\+?[\d\s-()]+$/, 'Please enter a valid phone number']
      },
      isPrimary: {
        type: Boolean,
        default: false
      }
    }],
    doctor: {
      name: {
        type: String,
        trim: true
      },
      clinic: {
        type: String,
        trim: true
      },
      phone: {
        type: String,
        match: [/^\+?[\d\s-()]+$/, 'Please enter a valid phone number']
      },
      email: {
        type: String,
        lowercase: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
      }
    },
    insuranceInfo: {
      provider: String,
      policyNumber: String,
      groupNumber: String,
      memberId: String
    }
  },
  notes: {
    type: String,
    maxlength: [1000, 'Notes cannot be more than 1000 characters']
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for better query performance
childSchema.index({ parentId: 1, isActive: 1 });
childSchema.index({ dob: 1 });
childSchema.index({ name: 1 });

// Virtual for age in months
childSchema.virtual('ageInMonths').get(function() {
  return moment().diff(moment(this.dob), 'months');
});

// Virtual for age in years
childSchema.virtual('ageInYears').get(function() {
  return moment().diff(moment(this.dob), 'years');
});

// Virtual for formatted age
childSchema.virtual('ageFormatted').get(function() {
  const years = moment().diff(moment(this.dob), 'years');
  const months = moment().diff(moment(this.dob), 'months') % 12;
  
  if (years === 0) {
    return `${months} month${months !== 1 ? 's' : ''}`;
  } else if (months === 0) {
    return `${years} year${years !== 1 ? 's' : ''}`;
  } else {
    return `${years} year${years !== 1 ? 's' : ''}, ${months} month${months !== 1 ? 's' : ''}`;
  }
});

// Virtual to populate vaccination records
childSchema.virtual('vaccinationRecords', {
  ref: 'VaccinationRecord',
  localField: '_id',
  foreignField: 'childId'
});

// Static method to find children by parent
childSchema.statics.findByParent = function(parentId) {
  return this.find({ parentId, isActive: true }).sort({ createdAt: -1 });
};

// Static method to find active children
childSchema.statics.findActive = function() {
  return this.find({ isActive: true });
};

// Method to get next vaccination due
childSchema.methods.getNextVaccinationDue = async function() {
  const VaccinationRecord = mongoose.model('VaccinationRecord');
  return await VaccinationRecord.findOne({
    childId: this._id,
    status: 'scheduled',
    scheduledDate: { $gte: new Date() }
  })
  .populate('vaccineId', 'name')
  .sort({ scheduledDate: 1 });
};

// Method to get overdue vaccinations
childSchema.methods.getOverdueVaccinations = async function() {
  const VaccinationRecord = mongoose.model('VaccinationRecord');
  return await VaccinationRecord.find({
    childId: this._id,
    status: 'scheduled',
    scheduledDate: { $lt: new Date() }
  })
  .populate('vaccineId', 'name')
  .sort({ scheduledDate: 1 });
};

// Ensure virtual fields are serialized
childSchema.set('toJSON', { virtuals: true });
childSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Child', childSchema);