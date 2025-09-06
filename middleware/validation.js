const { body, param, query, validationResult } = require('express-validator');
const { AppError } = require('./errorHandler');

// Validation result handler - FIX: This should be named validateRequest for compatibility
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => ({
      field: error.path || error.param,
      message: error.msg,
      value: error.value
    }));

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errorMessages
    });
  }
  
  next();
};

// Keep the original name for backward compatibility
const handleValidationErrors = validateRequest;

// User validation rules
const validateUserRegistration = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Name can only contain letters and spaces'),
  
  body('email')
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  
  body('password')
    .isLength({ min: 6, max: 128 })
    .withMessage('Password must be between 6 and 128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),
  
  body('role')
    .optional()
    .isIn(['parent', 'doctor', 'admin'])
    .withMessage('Role must be parent, doctor, or admin'),
  
  body('phone')
    .optional()
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),
  
  validateRequest
];

const validateUserLogin = [
  body('email')
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  
  validateRequest
];

const validateUserUpdate = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  
  body('phone')
    .optional()
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),
  
  body('address.street')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Street address cannot exceed 200 characters'),
  
  body('address.city')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('City cannot exceed 100 characters'),
  
  body('address.state')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('State cannot exceed 100 characters'),
  
  body('address.zipCode')
    .optional()
    .trim()
    .matches(/^\d{5}(-\d{4})?$/)
    .withMessage('Please provide a valid ZIP code'),
  
  body('notificationPreferences.reminderDays')
    .optional()
    .isInt({ min: 1, max: 30 })
    .withMessage('Reminder days must be between 1 and 30'),
  
  validateRequest
];

// Child validation rules
const validateChild = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Child name must be between 1 and 100 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Name can only contain letters and spaces'),
  
  body('dob')
    .isISO8601()
    .withMessage('Please provide a valid date of birth')
    .custom((value) => {
      const dob = new Date(value);
      const today = new Date();
      if (dob > today) {
        throw new Error('Date of birth cannot be in the future');
      }
      // Check if child is not older than 18 years
      const age = today.getFullYear() - dob.getFullYear();
      if (age > 18) {
        throw new Error('Child cannot be older than 18 years');
      }
      return true;
    }),
  
  body('gender')
    .isIn(['male', 'female', 'other'])
    .withMessage('Gender must be male, female, or other'),
  
  body('birthWeight')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Birth weight must be a positive number'),
  
  body('birthHeight')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Birth height must be a positive number'),
  
  body('bloodType')
    .optional()
    .isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])
    .withMessage('Invalid blood type'),
  
  body('medicalInfo.allergies')
    .optional()
    .isArray()
    .withMessage('Allergies must be an array'),
  
  body('medicalInfo.allergies.*')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Each allergy must be between 1 and 100 characters'),
  
  validateRequest
];

// Vaccine validation rules
const validateVaccine = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Vaccine name must be between 1 and 200 characters'),
  
  body('description')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Description must be between 1 and 1000 characters'),
  
  body('recommendedAges')
    .isArray({ min: 1 })
    .withMessage('At least one recommended age must be provided'),
  
  body('recommendedAges.*.ageMonths')
    .isInt({ min: 0 })
    .withMessage('Age in months must be a non-negative integer'),
  
  body('recommendedAges.*.dose')
    .trim()
    .notEmpty()
    .withMessage('Dose information is required'),
  
  body('category')
    .optional()
    .isIn(['routine', 'travel', 'high-risk', 'seasonal'])
    .withMessage('Invalid vaccine category'),
  
  body('sideEffects')
    .optional()
    .isArray()
    .withMessage('Side effects must be an array'),
  
  validateRequest
];

// Vaccination record validation rules
const validateVaccinationRecord = [
  body('childId')
    .isMongoId()
    .withMessage('Valid child ID is required'),
  
  body('vaccineId')
    .isMongoId()
    .withMessage('Valid vaccine ID is required'),
  
  body('scheduledDate')
    .isISO8601()
    .withMessage('Please provide a valid scheduled date')
    .custom((value) => {
      const scheduledDate = new Date(value);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (scheduledDate < today) {
        throw new Error('Scheduled date cannot be in the past');
      }
      return true;
    }),
  
  body('dose')
    .trim()
    .notEmpty()
    .withMessage('Dose information is required'),
  
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters'),
  
  validateRequest
];

const validateVaccinationRecordUpdate = [
  body('status')
    .optional()
    .isIn(['scheduled', 'completed', 'missed', 'cancelled'])
    .withMessage('Invalid vaccination status'),
  
  body('completedDate')
    .optional()
    .isISO8601()
    .withMessage('Please provide a valid completion date'),
  
  body('batchNumber')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Batch number cannot exceed 50 characters'),
  
  body('administrationSite')
    .optional()
    .isIn(['left-arm', 'right-arm', 'left-thigh', 'right-thigh', 'oral', 'nasal'])
    .withMessage('Invalid administration site'),
  
  body('reactions')
    .optional()
    .isArray()
    .withMessage('Reactions must be an array'),
  
  body('reactions.*.type')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Reaction type is required'),
  
  body('reactions.*.severity')
    .optional()
    .isIn(['mild', 'moderate', 'severe'])
    .withMessage('Invalid reaction severity'),
  
  validateRequest
];

// Parameter validation
const validateMongoId = (paramName) => [
  param(paramName)
    .isMongoId()
    .withMessage(`Invalid ${paramName} format`),
  
  validateRequest
];

// Query validation
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  query('sort')
    .optional()
    .isIn(['createdAt', '-createdAt', 'name', '-name', 'dob', '-dob', 'scheduledDate', '-scheduledDate'])
    .withMessage('Invalid sort parameter'),
  
  validateRequest
];

const validateDateRange = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date')
    .custom((endDate, { req }) => {
      if (req.query.startDate && new Date(endDate) <= new Date(req.query.startDate)) {
        throw new Error('End date must be after start date');
      }
      return true;
    }),
  
  validateRequest
];

// Notification validation
const validateNotification = [
  body('type')
    .isIn(['reminder', 'overdue', 'completed', 'scheduled', 'cancelled', 'general'])
    .withMessage('Invalid notification type'),
  
  body('title')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Title must be between 1 and 200 characters'),
  
  body('message')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Message must be between 1 and 500 characters'),
  
  body('deliveryType')
    .isIn(['email', 'sms', 'push'])
    .withMessage('Invalid delivery type'),
  
  body('scheduledTime')
    .isISO8601()
    .withMessage('Please provide a valid scheduled time'),
  
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Invalid priority level'),
  
  validateRequest
];

// File upload validation
const validateFileUpload = (req, res, next) => {
  if (!req.file && !req.files) {
    return next();
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
  const maxSize = 5 * 1024 * 1024; // 5MB

  const files = req.files || [req.file];
  
  for (const file of files) {
    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: 'Only JPEG, PNG, and GIF images are allowed'
      });
    }
    
    if (file.size > maxSize) {
      return res.status(400).json({
        success: false,
        message: 'File size cannot exceed 5MB'
      });
    }
  }
  
  next();
};

// Custom object-based validation middleware to match your route expectations
const objectValidation = (schema) => {
  return (req, res, next) => {
    const errors = [];

    // Validate body
    if (schema.body) {
      const bodyErrors = validateObject(req.body, schema.body, 'body');
      errors.push(...bodyErrors);
    }

    // Validate query parameters
    if (schema.query) {
      const queryErrors = validateObject(req.query, schema.query, 'query');
      errors.push(...queryErrors);
    }

    // Validate params
    if (schema.params) {
      const paramErrors = validateObject(req.params, schema.params, 'params');
      errors.push(...paramErrors);
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors
      });
    }

    next();
  };
};

// Helper function to validate objects
const validateObject = (data, schema, location) => {
  const errors = [];
  
  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field];
    const isRequired = rules.required === true;
    const isOptional = rules.optional === true || !isRequired;

    // Check required fields
    if (isRequired && (value === undefined || value === null || value === '')) {
      errors.push({
        field: `${location}.${field}`,
        message: `${field} is required`,
        value: value
      });
      continue;
    }

    // Skip validation for optional fields that are undefined
    if (isOptional && (value === undefined || value === null)) {
      continue;
    }

    // Type validation
    if (rules.type && value !== undefined) {
      if (!validateType(value, rules.type)) {
        errors.push({
          field: `${location}.${field}`,
          message: `${field} must be of type ${rules.type}`,
          value: value
        });
        continue;
      }
    }

    // String validations
    if (rules.type === 'string' && typeof value === 'string') {
      if (rules.minLength && value.length < rules.minLength) {
        errors.push({
          field: `${location}.${field}`,
          message: `${field} must be at least ${rules.minLength} characters long`,
          value: value
        });
      }

      if (rules.maxLength && value.length > rules.maxLength) {
        errors.push({
          field: `${location}.${field}`,
          message: `${field} must be no more than ${rules.maxLength} characters long`,
          value: value
        });
      }

      if (rules.pattern && !new RegExp(rules.pattern).test(value)) {
        errors.push({
          field: `${location}.${field}`,
          message: `${field} format is invalid`,
          value: value
        });
      }

      if (rules.enum && !rules.enum.includes(value)) {
        errors.push({
          field: `${location}.${field}`,
          message: `${field} must be one of: ${rules.enum.join(', ')}`,
          value: value
        });
      }

      if (rules.format === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        errors.push({
          field: `${location}.${field}`,
          message: `${field} must be a valid email address`,
          value: value
        });
      }

      if (rules.format === 'date' && isNaN(Date.parse(value))) {
        errors.push({
          field: `${location}.${field}`,
          message: `${field} must be a valid date`,
          value: value
        });
      }

      if (rules.format === 'date-time' && isNaN(Date.parse(value))) {
        errors.push({
          field: `${location}.${field}`,
          message: `${field} must be a valid date-time`,
          value: value
        });
      }
    }

    // Number validations
    if (rules.type === 'number' && typeof value === 'number') {
      if (rules.min !== undefined && value < rules.min) {
        errors.push({
          field: `${location}.${field}`,
          message: `${field} must be at least ${rules.min}`,
          value: value
        });
      }

      if (rules.max !== undefined && value > rules.max) {
        errors.push({
          field: `${location}.${field}`,
          message: `${field} must be no more than ${rules.max}`,
          value: value
        });
      }
    }

    // Array validations
    if (rules.type === 'array' && Array.isArray(value)) {
      if (rules.minItems && value.length < rules.minItems) {
        errors.push({
          field: `${location}.${field}`,
          message: `${field} must have at least ${rules.minItems} items`,
          value: value
        });
      }

      if (rules.maxItems && value.length > rules.maxItems) {
        errors.push({
          field: `${location}.${field}`,
          message: `${field} must have no more than ${rules.maxItems} items`,
          value: value
        });
      }

      // Validate array items
      if (rules.items && rules.items.type) {
        value.forEach((item, index) => {
          if (!validateType(item, rules.items.type)) {
            errors.push({
              field: `${location}.${field}[${index}]`,
              message: `${field} items must be of type ${rules.items.type}`,
              value: item
            });
          }

          if (rules.items.enum && !rules.items.enum.includes(item)) {
            errors.push({
              field: `${location}.${field}[${index}]`,
              message: `${field} items must be one of: ${rules.items.enum.join(', ')}`,
              value: item
            });
          }

          if (rules.items.pattern && typeof item === 'string' && !new RegExp(rules.items.pattern).test(item)) {
            errors.push({
              field: `${location}.${field}[${index}]`,
              message: `${field} item format is invalid`,
              value: item
            });
          }
        });
      }
    }
  }

  return errors;
};

// Helper function to validate types
const validateType = (value, expectedType) => {
  switch (expectedType) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !isNaN(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    default:
      return true;
  }
};
module.exports = {
  validateRequest, // express-validator wrapper
  handleValidationErrors,
  validateUserRegistration,
  validateUserLogin,
  validateUserUpdate,
  validateChild,
  validateVaccine,
  validateVaccinationRecord,
  validateVaccinationRecordUpdate,
  validateMongoId,
  validatePagination,
  validateDateRange,
  validateNotification,
  validateFileUpload,
  objectValidation // ✅ <-- THIS WAS MISSING
};
