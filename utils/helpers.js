const moment = require('moment');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { AGE_UNITS, VACCINATION_STATUS, JWT } = require('./constants');

/**
 * Calculate age in various units
 * @param {Date} dateOfBirth - Date of birth
 * @param {String} unit - Unit of measurement (days, weeks, months, years)
 * @returns {Number} Age in specified unit
 */
const calculateAge = (dateOfBirth, unit = 'years') => {
  const now = moment();
  const birth = moment(dateOfBirth);
  
  switch (unit) {
    case AGE_UNITS.DAYS:
      return now.diff(birth, 'days');
    case AGE_UNITS.WEEKS:
      return now.diff(birth, 'weeks');
    case AGE_UNITS.MONTHS:
      return now.diff(birth, 'months');
    case AGE_UNITS.YEARS:
      return now.diff(birth, 'years');
    default:
      return now.diff(birth, 'years');
  }
};

/**
 * Convert age to days for consistent comparison
 * @param {Number} value - Age value
 * @param {String} unit - Unit of measurement
 * @returns {Number} Age in days
 */
const convertToDays = (value, unit) => {
  const conversions = {
    [AGE_UNITS.DAYS]: 1,
    [AGE_UNITS.WEEKS]: 7,
    [AGE_UNITS.MONTHS]: 30.44, // Average days per month
    [AGE_UNITS.YEARS]: 365.25 // Account for leap years
  };
  
  return Math.floor(value * conversions[unit]);
};

/**
 * Format date for display
 * @param {Date} date - Date to format
 * @param {String} format - Moment.js format string
 * @returns {String} Formatted date string
 */
const formatDate = (date, format = 'YYYY-MM-DD') => {
  return moment(date).format(format);
};

/**
 * Check if a date is in the past
 * @param {Date} date - Date to check
 * @returns {Boolean} True if date is in the past
 */
const isPastDate = (date) => {
  return moment(date).isBefore(moment(), 'day');
};

/**
 * Check if a date is today
 * @param {Date} date - Date to check
 * @returns {Boolean} True if date is today
 */
const isToday = (date) => {
  return moment(date).isSame(moment(), 'day');
};

/**
 * Get days until a specific date
 * @param {Date} date - Target date
 * @returns {Number} Number of days until the date (negative if past)
 */
const getDaysUntil = (date) => {
  return moment(date).diff(moment(), 'days');
};

/**
 * Check if vaccination is overdue
 * @param {Date} scheduledDate - Scheduled vaccination date
 * @param {Number} gracePeriod - Grace period in days (default: 7)
 * @returns {Boolean} True if vaccination is overdue
 */
const isVaccinationOverdue = (scheduledDate, gracePeriod = 7) => {
  const daysUntil = getDaysUntil(scheduledDate);
  return daysUntil < -gracePeriod;
};

/**
 * Generate random string
 * @param {Number} length - Length of the string
 * @returns {String} Random string
 */
const generateRandomString = (length = 32) => {
  return crypto.randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
};

/**
 * Hash password
 * @param {String} password - Plain text password
 * @returns {String} Hashed password
 */
const hashPassword = async (password) => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

/**
 * Compare password with hash
 * @param {String} password - Plain text password
 * @param {String} hash - Hashed password
 * @returns {Boolean} True if password matches
 */
const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

/**
 * Generate JWT token
 * @param {Object} payload - Token payload
 * @param {String} expiresIn - Token expiration
 * @returns {String} JWT token
 */
const generateToken = (payload, expiresIn = JWT.EXPIRES_IN) => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
};

/**
 * Verify JWT token
 * @param {String} token - JWT token
 * @returns {Object} Decoded token payload
 */
const verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

/**
 * Paginate query results
 * @param {Object} query - Mongoose query object
 * @param {Number} page - Page number
 * @param {Number} limit - Items per page
 * @param {String} sortBy - Field to sort by
 * @param {String} sortOrder - Sort order (asc/desc)
 * @returns {Object} Paginated results
 */
const paginateResults = async (query, page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc') => {
  const skip = (page - 1) * limit;
  const sortDirection = sortOrder === 'asc' ? 1 : -1;
  const sort = { [sortBy]: sortDirection };
  
  const [results, totalCount] = await Promise.all([
    query.clone().skip(skip).limit(limit).sort(sort),
    query.clone().countDocuments()
  ]);
  
  const totalPages = Math.ceil(totalCount / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;
  
  return {
    data: results,
    pagination: {
      currentPage: page,
      totalPages,
      totalCount,
      limit,
      hasNextPage,
      hasPrevPage,
      nextPage: hasNextPage ? page + 1 : null,
      prevPage: hasPrevPage ? page - 1 : null
    }
  };
};

/**
 * Sanitize user input
 * @param {String} input - Input string to sanitize
 * @returns {String} Sanitized string
 */
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, ''); // Remove event handlers
};

/**
 * Validate email format
 * @param {String} email - Email address
 * @returns {Boolean} True if email is valid
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate phone number format
 * @param {String} phone - Phone number
 * @returns {Boolean} True if phone number is valid
 */
const isValidPhone = (phone) => {
  const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
  return phoneRegex.test(phone);
};

/**
 * Generate vaccination schedule for a child
 * @param {Date} dateOfBirth - Child's date of birth
 * @param {Array} vaccines - Array of vaccine objects
 * @returns {Array} Vaccination schedule
 */
const generateVaccinationSchedule = (dateOfBirth, vaccines) => {
  const schedule = [];
  const birthDate = moment(dateOfBirth);
  
  vaccines.forEach(vaccine => {
    vaccine.schedule.forEach(dose => {
      const scheduledDate = birthDate.clone().add(dose.ageInDays, 'days').toDate();
      
      schedule.push({
        vaccine: vaccine._id,
        vaccineName: vaccine.name,
        doseNumber: dose.dose,
        scheduledDate,
        description: dose.description,
        status: VACCINATION_STATUS.SCHEDULED
      });
    });
  });
  
  // Sort by scheduled date
  return schedule.sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate));
};

/**
 * Calculate next vaccination due date
 * @param {Array} vaccinationRecords - Child's vaccination records
 * @returns {Date|null} Next due date or null if no upcoming vaccinations
 */
const getNextVaccinationDueDate = (vaccinationRecords) => {
  const upcomingVaccinations = vaccinationRecords
    .filter(record => 
      record.status === VACCINATION_STATUS.SCHEDULED && 
      moment(record.scheduledDate).isAfter(moment())
    )
    .sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate));
  
  return upcomingVaccinations.length > 0 ? upcomingVaccinations[0].scheduledDate : null;
};

/**
 * Get overdue vaccinations
 * @param {Array} vaccinationRecords - Child's vaccination records
 * @param {Number} gracePeriod - Grace period in days
 * @returns {Array} Overdue vaccination records
 */
const getOverdueVaccinations = (vaccinationRecords, gracePeriod = 7) => {
  return vaccinationRecords.filter(record => 
    record.status === VACCINATION_STATUS.SCHEDULED && 
    isVaccinationOverdue(record.scheduledDate, gracePeriod)
  );
};

/**
 * Get upcoming vaccinations within specified days
 * @param {Array} vaccinationRecords - Child's vaccination records
 * @param {Number} days - Number of days to look ahead
 * @returns {Array} Upcoming vaccination records
 */
const getUpcomingVaccinations = (vaccinationRecords, days = 30) => {
  const futureDate = moment().add(days, 'days');
  
  return vaccinationRecords
    .filter(record => 
      record.status === VACCINATION_STATUS.SCHEDULED && 
      moment(record.scheduledDate).isBetween(moment(), futureDate, 'day', '[]')
    )
    .sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate));
};

/**
 * Calculate vaccination completion percentage
 * @param {Array} vaccinationRecords - Child's vaccination records
 * @returns {Number} Completion percentage (0-100)
 */
const calculateVaccinationProgress = (vaccinationRecords) => {
  if (vaccinationRecords.length === 0) return 0;
  
  const completedCount = vaccinationRecords.filter(record => 
    record.status === VACCINATION_STATUS.COMPLETED
  ).length;
  
  return Math.round((completedCount / vaccinationRecords.length) * 100);
};

/**
 * Format file size in human readable format
 * @param {Number} bytes - File size in bytes
 * @returns {String} Formatted file size
 */
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Generate unique filename
 * @param {String} originalName - Original filename
 * @returns {String} Unique filename
 */
const generateUniqueFilename = (originalName) => {
  const timestamp = Date.now();
  const randomString = generateRandomString(8);
  const extension = originalName.split('.').pop();
  
  return `${timestamp}-${randomString}.${extension}`;
};

/**
 * Deep clone an object
 * @param {Object} obj - Object to clone
 * @returns {Object} Cloned object
 */
const deepClone = (obj) => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  if (typeof obj === 'object') {
    const clonedObj = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = deepClone(obj[key]);
      }
    }
    return clonedObj;
  }
};

/**
 * Remove undefined and null values from object
 * @param {Object} obj - Object to clean
 * @returns {Object} Cleaned object
 */
const removeEmptyFields = (obj) => {
  const cleaned = {};
  
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];
      
      if (value !== undefined && value !== null) {
        if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
          const cleanedNested = removeEmptyFields(value);
          if (Object.keys(cleanedNested).length > 0) {
            cleaned[key] = cleanedNested;
          }
        } else {
          cleaned[key] = value;
        }
      }
    }
  }
  
  return cleaned;
};

/**
 * Create API response object
 * @param {Boolean} success - Success status
 * @param {String} message - Response message
 * @param {Object} data - Response data
 * @param {Object} meta - Additional metadata
 * @returns {Object} API response object
 */
const createApiResponse = (success, message, data = null, meta = {}) => {
  const response = {
    success,
    message,
    timestamp: new Date().toISOString()
  };
  
  if (data !== null) {
    response.data = data;
  }
  
  if (Object.keys(meta).length > 0) {
    response.meta = meta;
  }
  
  return response;
};

/**
 * Capitalize first letter of each word
 * @param {String} str - String to capitalize
 * @returns {String} Capitalized string
 */
const capitalizeWords = (str) => {
  if (!str) return '';
  
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

/**
 * Generate OTP
 * @param {Number} length - OTP length
 * @returns {String} Generated OTP
 */
const generateOTP = (length = 6) => {
  const digits = '0123456789';
  let otp = '';
  
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * digits.length)];
  }
  
  return otp;
};

/**
 * Sleep/delay function
 * @param {Number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after specified time
 */
const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

module.exports = {
  calculateAge,
  convertToDays,
  formatDate,
  isPastDate,
  isToday,
  getDaysUntil,
  isVaccinationOverdue,
  generateRandomString,
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  paginateResults,
  sanitizeInput,
  isValidEmail,
  isValidPhone,
  generateVaccinationSchedule,
  getNextVaccinationDueDate,
  getOverdueVaccinations,
  getUpcomingVaccinations,
  calculateVaccinationProgress,
  formatFileSize,
  generateUniqueFilename,
  deepClone,
  removeEmptyFields,
  createApiResponse,
  capitalizeWords,
  generateOTP,
  sleep
};