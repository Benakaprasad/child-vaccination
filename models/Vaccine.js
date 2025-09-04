const mongoose = require('mongoose');
const { VACCINE_CATEGORIES } = require('../utils/constants');

const vaccineSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Vaccine name is required'],
    trim: true,
    unique: true,
    maxlength: [200, 'Vaccine name cannot be more than 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Vaccine description is required'],
    maxlength: [1000, 'Description cannot be more than 1000 characters']
  },
  shortName: {
    type: String,
    trim: true,
    uppercase: true,
    maxlength: [20, 'Short name cannot be more than 20 characters']
  },
  recommendedAges: [{
    ageMonths: {
      type: Number,
      required: [true, 'Age in months is required'],
      min: [0, 'Age cannot be negative']
    },
    dose: {
      type: String,
      required: [true, 'Dose information is required'],
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    isBooster: {
      type: Boolean,
      default: false
    },
    minInterval: {
      type: Number, // Days between doses
      min: [0, 'Interval cannot be negative']
    }
  }],
  sideEffects: [{
    effect: {
      type: String,
      required: true,
      trim: true
    },
    frequency: {
      type: String,
      enum: ['common', 'uncommon', 'rare', 'very rare'],
      default: 'common'
    },
    severity: {
      type: String,
      enum: ['mild', 'moderate', 'severe'],
      default: 'mild'
    },
    description: String
  }],
  contraindications: [{
    type: String,
    trim: true
  }],
  precautions: [{
    type: String,
    trim: true
  }],
  manufacturer: {
    type: String,
    trim: true
  },
  brandNames: [{
    type: String,
    trim: true
  }],
  category: {
    type: String,
    enum: Object.values(VACCINE_CATEGORIES),
    default: VACCINE_CATEGORIES.ROUTINE
  },
  routeOfAdministration: {
    type: String,
    enum: ['intramuscular', 'subcutaneous', 'oral', 'nasal', 'intradermal'],
    default: 'intramuscular'
  },
  storageRequirements: {
    temperature: {
      min: Number,
      max: Number,
      unit: {
        type: String,
        enum: ['celsius', 'fahrenheit'],
        default: 'celsius'
      }
    },
    notes: String
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isLive: {
    type: Boolean,
    default: false // Live vs inactivated vaccine
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Creator is required']
  },
  approvalDate: {
    type: Date
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  version: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true
});

// Indexes for better performance
vaccineSchema.index({ name: 1, isActive: 1 });
vaccineSchema.index({ category: 1, isActive: 1 });
vaccineSchema.index({ 'recommendedAges.ageMonths': 1 });
vaccineSchema.index({ createdBy: 1 });

// Text index for search functionality
vaccineSchema.index({
  name: 'text',
  description: 'text',
  shortName: 'text'
});

// Virtual for vaccination records
vaccineSchema.virtual('vaccinationRecords', {
  ref: 'VaccinationRecord',
  localField: '_id',
  foreignField: 'vaccineId'
});

// Static method to find active vaccines
vaccineSchema.statics.findActive = function(category = null) {
  const query = { isActive: true };
  if (category) query.category = category;
  return this.find(query).sort({ name: 1 });
};

// Static method to search vaccines
vaccineSchema.statics.search = function(searchTerm, category = null) {
  const query = {
    isActive: true,
    $or: [
      { name: { $regex: searchTerm, $options: 'i' } },
      { description: { $regex: searchTerm, $options: 'i' } },
      { shortName: { $regex: searchTerm, $options: 'i' } }
    ]
  };
  
  if (category) query.category = category;
  return this.find(query).sort({ name: 1 });
};

// Static method to find vaccines for age
vaccineSchema.statics.findForAge = function(ageInMonths, category = null) {
  const query = {
    isActive: true,
    'recommendedAges.ageMonths': { $lte: ageInMonths }
  };
  
  if (category) query.category = category;
  return this.find(query).sort({ name: 1 });
};

// Method to get dose for specific age
vaccineSchema.methods.getDoseForAge = function(ageInMonths) {
  const applicableDoses = this.recommendedAges.filter(
    age => age.ageMonths <= ageInMonths
  );
  
  if (applicableDoses.length === 0) return null;
  
  // Return the latest applicable dose
  return applicableDoses.sort((a, b) => b.ageMonths - a.ageMonths)[0];
};

// Method to get next dose
vaccineSchema.methods.getNextDose = function(currentAgeInMonths) {
  const futureDoses = this.recommendedAges.filter(
    age => age.ageMonths > currentAgeInMonths
  );
  
  if (futureDoses.length === 0) return null;
  
  // Return the next dose
  return futureDoses.sort((a, b) => a.ageMonths - b.ageMonths)[0];
};

// Pre-save middleware to update version and lastUpdated
vaccineSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.version += 1;
    this.lastUpdated = new Date();
  }
  next();
});

// Ensure virtual fields are serialized
vaccineSchema.set('toJSON', { virtuals: true });
vaccineSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Vaccine', vaccineSchema);