const Joi = require('joi');
const moment = require('moment');

// Common validation schemas
const objectIdSchema = Joi.string().regex(/^[0-9a-fA-F]{24}$/);

// User validation schemas
const userRegistrationSchema = Joi.object({
  firstName: Joi.string().min(2).max(50).required().trim(),
  lastName: Joi.string().min(2).max(50).required().trim(),
  email: Joi.string().email().required().lowercase().trim(),
  password: Joi.string().min(8).max(128).required()
    .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#\$%\^&\*])')),
  phone: Joi.string().pattern(/^[\+]?[1-9][\d]{0,15}$/).required(),
  role: Joi.string().valid('parent', 'doctor', 'admin').default('parent'),
  address: Joi.object({
    street: Joi.string().max(100),
    city: Joi.string().max(50),
    state: Joi.string().max(50),
    zipCode: Joi.string().max(10),
    country: Joi.string().max(50)
  }),
  preferences: Joi.object({
    notifications: Joi.object({
      email: Joi.boolean().default(true),
      sms: Joi.boolean().default(true),
      push: Joi.boolean().default(true)
    }),
    reminderTiming: Joi.number().min(1).max(30).default(7)
  })
});

const userLoginSchema = Joi.object({
  email: Joi.string().email().required().lowercase().trim(),
  password: Joi.string().required()
});

const userUpdateSchema = Joi.object({
  firstName: Joi.string().min(2).max(50).trim(),
  lastName: Joi.string().min(2).max(50).trim(),
  phone: Joi.string().pattern(/^[\+]?[1-9][\d]{0,15}$/),
  address: Joi.object({
    street: Joi.string().max(100),
    city: Joi.string().max(50),
    state: Joi.string().max(50),
    zipCode: Joi.string().max(10),
    country: Joi.string().max(50)
  }),
  preferences: Joi.object({
    notifications: Joi.object({
      email: Joi.boolean(),
      sms: Joi.boolean(),
      push: Joi.boolean()
    }),
    reminderTiming: Joi.number().min(1).max(30)
  })
});

// Child validation schemas
const childSchema = Joi.object({
  firstName: Joi.string().min(2).max(50).required().trim(),
  lastName: Joi.string().min(2).max(50).required().trim(),
  dateOfBirth: Joi.date().max('now').required(),
  gender: Joi.string().valid('male', 'female', 'other').required(),
  bloodType: Joi.string().valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'),
  allergies: Joi.array().items(Joi.string().max(100)),
  medicalConditions: Joi.array().items(Joi.string().max(200)),
  height: Joi.number().positive(),
  weight: Joi.number().positive(),
  doctorInfo: Joi.object({
    name: Joi.string().max(100),
    phone: Joi.string().pattern(/^[\+]?[1-9][\d]{0,15}$/),
    clinic: Joi.string().max(100)
  }),
  emergencyContact: Joi.object({
    name: Joi.string().max(100),
    relationship: Joi.string().max(50),
    phone: Joi.string().pattern(/^[\+]?[1-9][\d]{0,15}$/)
  })
});

const childUpdateSchema = Joi.object({
  firstName: Joi.string().min(2).max(50).trim(),
  lastName: Joi.string().min(2).max(50).trim(),
  gender: Joi.string().valid('male', 'female', 'other'),
  bloodType: Joi.string().valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'),
  allergies: Joi.array().items(Joi.string().max(100)),
  medicalConditions: Joi.array().items(Joi.string().max(200)),
  height: Joi.number().positive(),
  weight: Joi.number().positive(),
  doctorInfo: Joi.object({
    name: Joi.string().max(100),
    phone: Joi.string().pattern(/^[\+]?[1-9][\d]{0,15}$/),
    clinic: Joi.string().max(100)
  }),
  emergencyContact: Joi.object({
    name: Joi.string().max(100),
    relationship: Joi.string().max(50),
    phone: Joi.string().pattern(/^[\+]?[1-9][\d]{0,15}$/)
  })
});

// Vaccine validation schemas
const vaccineSchema = Joi.object({
  name: Joi.string().min(2).max(100).required().trim(),
  description: Joi.string().max(500).required(),
  manufacturer: Joi.string().max(100).required(),
  type: Joi.string().valid('live', 'inactivated', 'subunit', 'toxoid', 'conjugate').required(),
  ageGroups: Joi.array().items(Joi.object({
    minAge: Joi.number().min(0).required(),
    maxAge: Joi.number().min(Joi.ref('minAge')).required(),
    unit: Joi.string().valid('days', 'weeks', 'months', 'years').required()
  })).min(1).required(),
  schedule: Joi.array().items(Joi.object({
    dose: Joi.number().integer().min(1).required(),
    ageInDays: Joi.number().integer().min(0).required(),
    description: Joi.string().max(200)
  })).min(1).required(),
  sideEffects: Joi.array().items(Joi.string().max(100)),
  contraindications: Joi.array().items(Joi.string().max(200)),
  isActive: Joi.boolean().default(true)
});

const vaccineUpdateSchema = Joi.object({
  name: Joi.string().min(2).max(100).trim(),
  description: Joi.string().max(500),
  manufacturer: Joi.string().max(100),
  type: Joi.string().valid('live', 'inactivated', 'subunit', 'toxoid', 'conjugate'),
  ageGroups: Joi.array().items(Joi.object({
    minAge: Joi.number().min(0).required(),
    maxAge: Joi.number().min(Joi.ref('minAge')).required(),
    unit: Joi.string().valid('days', 'weeks', 'months', 'years').required()
  })).min(1),
  schedule: Joi.array().items(Joi.object({
    dose: Joi.number().integer().min(1).required(),
    ageInDays: Joi.number().integer().min(0).required(),
    description: Joi.string().max(200)
  })).min(1),
  sideEffects: Joi.array().items(Joi.string().max(100)),
  contraindications: Joi.array().items(Joi.string().max(200)),
  isActive: Joi.boolean()
});

// Vaccination Record validation schemas
const vaccinationRecordSchema = Joi.object({
  child: objectIdSchema.required(),
  vaccine: objectIdSchema.required(),
  doseNumber: Joi.number().integer().min(1).required(),
  scheduledDate: Joi.date().min('now').required(),
  notes: Joi.string().max(500)
});

const vaccinationRecordUpdateSchema = Joi.object({
  scheduledDate: Joi.date(),
  administeredDate: Joi.date(),
  status: Joi.string().valid('scheduled', 'completed', 'missed', 'cancelled'),
  batchNumber: Joi.string().max(50),
  administeredBy: Joi.string().max(100),
  location: Joi.string().max(200),
  sideEffects: Joi.array().items(Joi.string().max(100)),
  notes: Joi.string().max(500),
  nextDueDate: Joi.date()
});

const completeVaccinationSchema = Joi.object({
  administeredDate: Joi.date().max('now').default(new Date()),
  batchNumber: Joi.string().max(50).required(),
  administeredBy: Joi.string().max(100).required(),
  location: Joi.string().max(200).required(),
  sideEffects: Joi.array().items(Joi.string().max(100)).default([]),
  notes: Joi.string().max(500)
});

// Notification validation schemas
const notificationSchema = Joi.object({
  recipient: objectIdSchema.required(),
  type: Joi.string().valid('reminder', 'overdue', 'completed', 'cancelled').required(),
  title: Joi.string().max(100).required(),
  message: Joi.string().max(500).required(),
  vaccinationRecord: objectIdSchema,
  scheduledDate: Joi.date().min('now'),
  deliveryMethods: Joi.array().items(Joi.string().valid('email', 'sms', 'push')).min(1).required()
});

// Query validation schemas
const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  sortBy: Joi.string().default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

const dateRangeSchema = Joi.object({
  startDate: Joi.date(),
  endDate: Joi.date().min(Joi.ref('startDate'))
}).with('startDate', 'endDate');

// Custom validation functions
const validateAge = (dateOfBirth, minAge = 0, maxAge = 120) => {
  const age = moment().diff(moment(dateOfBirth), 'years');
  return age >= minAge && age <= maxAge;
};

const validateVaccinationEligibility = (childAge, vaccine) => {
  return vaccine.ageGroups.some(group => {
    const minAgeInDays = convertToDay(group.minAge, group.unit);
    const maxAgeInDays = convertToDay(group.maxAge, group.unit);
    return childAge >= minAgeInDays && childAge <= maxAgeInDays;
  });
};

const convertToDay = (value, unit) => {
  const conversions = {
    days: 1,
    weeks: 7,
    months: 30,
    years: 365
  };
  return value * conversions[unit];
};

const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePhone = (phone) => {
  const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
  return phoneRegex.test(phone);
};

const validatePassword = (password) => {
  // At least 8 characters, one uppercase, one lowercase, one number, one special character
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#\$%\^&\*])/;
  return password.length >= 8 && passwordRegex.test(password);
};

module.exports = {
  // Schemas
  userRegistrationSchema,
  userLoginSchema,
  userUpdateSchema,
  childSchema,
  childUpdateSchema,
  vaccineSchema,
  vaccineUpdateSchema,
  vaccinationRecordSchema,
  vaccinationRecordUpdateSchema,
  completeVaccinationSchema,
  notificationSchema,
  paginationSchema,
  dateRangeSchema,
  objectIdSchema,
  
  // Custom validation functions
  validateAge,
  validateVaccinationEligibility,
  validateEmail,
  validatePhone,
  validatePassword,
  convertToDay
};