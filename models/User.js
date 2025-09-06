const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { USER_ROLES } = require('../utils/constants');

// Prevent model overwrite error
const MODEL_NAME = 'User';

if (mongoose.models[MODEL_NAME]) {
  module.exports = mongoose.models[MODEL_NAME];
} else {
  const userSchema = new mongoose.Schema({
    // ADDED: firstName and lastName fields that controller expects
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: [50, 'First name cannot be more than 50 characters']
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      maxlength: [50, 'Last name cannot be more than 50 characters']
    },
    name: {
      type: String,
      trim: true,
      maxlength: [100, 'Name cannot be more than 100 characters']
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please enter a valid email'
      ]
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false
    },
    role: {
      type: String,
      enum: Object.values(USER_ROLES),
      default: USER_ROLES.PARENT
    },
    phone: {
      type: String,
      trim: true,
      match: [/^\+?[\d\s-()]+$/, 'Please enter a valid phone number']
    },
    address: {
      street: {
        type: String,
        trim: true
      },
      city: {
        type: String,
        trim: true
      },
      state: {
        type: String,
        trim: true
      },
      zipCode: {
        type: String,
        trim: true
      },
      country: {
        type: String,
        trim: true,
        default: 'United States'
      }
    },
    profileImage: {
      type: String,
      default: null
    },
    isActive: {
      type: Boolean,
      default: true
    },
    isEmailVerified: {
      type: Boolean,
      default: false
    },
    lastLogin: {
      type: Date,
      default: Date.now
    },
    notificationPreferences: {
      email: {
        type: Boolean,
        default: true
      },
      sms: {
        type: Boolean,
        default: false
      },
      push: {
        type: Boolean,
        default: true
      },
      reminderDays: {
        type: Number,
        default: 7,
        min: [1, 'Reminder days must be at least 1'],
        max: [30, 'Reminder days cannot be more than 30']
      }
    },
    resetPasswordToken: String,
    resetPasswordExpire: Date
  }, {
    timestamps: true
  });

  // Indexes
  userSchema.index({ email: 1 });
  userSchema.index({ role: 1 });
  userSchema.index({ isActive: 1 });

  // Hash password before saving
  userSchema.pre('save', async function(next) {
    // Set name from firstName and lastName if not provided
    if (this.firstName && this.lastName && !this.name) {
      this.name = `${this.firstName} ${this.lastName}`;
    }
    
    if (!this.isModified('password')) return next();
    
    try {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
      next();
    } catch (error) {
      next(error);
    }
  });

  // Compare password method
  userSchema.methods.comparePassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
  };

  // Remove password and sensitive data from JSON output
  userSchema.methods.toJSON = function() {
    const user = this.toObject();
    delete user.password;
    delete user.resetPasswordToken;
    delete user.resetPasswordExpire;
    return user;
  };

  // Get full name virtual
  userSchema.virtual('fullName').get(function() {
    if (this.firstName && this.lastName) {
      return `${this.firstName} ${this.lastName}`;
    }
    return this.name || '';
  });

  // Virtual for children - UPDATED field reference
  userSchema.virtual('children', {
    ref: 'Child',
    localField: '_id',
    foreignField: 'parent'
  });

  // Static method to find active users
  userSchema.statics.findActive = function() {
    return this.find({ isActive: true });
  };

  module.exports = mongoose.model(MODEL_NAME, userSchema);
}