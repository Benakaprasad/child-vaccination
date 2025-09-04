// User roles
const USER_ROLES = {
  PARENT: 'parent',
  DOCTOR: 'doctor',
  ADMIN: 'admin'
};

// Vaccination statuses
const VACCINATION_STATUS = {
  SCHEDULED: 'scheduled',
  COMPLETED: 'completed',
  MISSED: 'missed',
  CANCELLED: 'cancelled'
};

// Notification statuses
const NOTIFICATION_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  DELIVERED: 'delivered',
  FAILED: 'failed'
};

// Delivery types for notifications
const DELIVERY_TYPES = {
  EMAIL: 'email',
  SMS: 'sms',
  PUSH: 'push'
};

// Vaccine categories
const VACCINE_CATEGORIES = {
  ROUTINE: 'routine',
  TRAVEL: 'travel',
  HIGH_RISK: 'high-risk',
  SEASONAL: 'seasonal'
};

// Gender options
const GENDER_OPTIONS = {
  MALE: 'male',
  FEMALE: 'female',
  OTHER: 'other'
};

// Blood types
const BLOOD_TYPES = [
  'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'
];

// Administration sites
const ADMINISTRATION_SITES = {
  LEFT_ARM: 'left-arm',
  RIGHT_ARM: 'right-arm',
  LEFT_THIGH: 'left-thigh',
  RIGHT_THIGH: 'right-thigh',
  ORAL: 'oral',
  NASAL: 'nasal'
};

// Routes of administration
const ROUTES_OF_ADMINISTRATION = {
  INTRAMUSCULAR: 'intramuscular',
  SUBCUTANEOUS: 'subcutaneous',
  ORAL: 'oral',
  NASAL: 'nasal',
  INTRADERMAL: 'intradermal'
};

// Reaction severities
const REACTION_SEVERITIES = {
  MILD: 'mild',
  MODERATE: 'moderate',
  SEVERE: 'severe'
};

// Priority levels
const PRIORITY_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent'
};

// Notification types
const NOTIFICATION_TYPES = {
  REMINDER: 'reminder',
  OVERDUE: 'overdue',
  COMPLETED: 'completed',
  SCHEDULED: 'scheduled',
  CANCELLED: 'cancelled',
  GENERAL: 'general'
};

// File upload configurations
const FILE_UPLOAD = {
  MAX_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/gif'],
  PROFILE_PATH: 'uploads/profiles/',
  DOCUMENTS_PATH: 'uploads/documents/'
};

// Database collections
const COLLECTIONS = {
  USERS: 'users',
  CHILDREN: 'children',
  VACCINES: 'vaccines',
  VACCINATION_RECORDS: 'vaccinationrecords',
  NOTIFICATIONS: 'notifications'
};

// API Response messages
const RESPONSE_MESSAGES = {
  SUCCESS: {
    CREATED: 'Resource created successfully',
    UPDATED: 'Resource updated successfully',
    DELETED: 'Resource deleted successfully',
    RETRIEVED: 'Resource retrieved successfully',
    LOGIN: 'Login successful',
    LOGOUT: 'Logout successful'
  },
  ERROR: {
    NOT_FOUND: 'Resource not found',
    UNAUTHORIZED: 'Authentication required',
    FORBIDDEN: 'Access denied',
    VALIDATION_FAILED: 'Validation failed',
    DUPLICATE_ENTRY: 'Resource already exists',
    SERVER_ERROR: 'Internal server error',
    INVALID_CREDENTIALS: 'Invalid credentials',
    TOKEN_EXPIRED: 'Token has expired',
    TOKEN_INVALID: 'Invalid token'
  }
};

// Common age milestones in months
const AGE_MILESTONES = {
  BIRTH: 0,
  TWO_MONTHS: 2,
  FOUR_MONTHS: 4,
  SIX_MONTHS: 6,
  TWELVE_MONTHS: 12,
  FIFTEEN_MONTHS: 15,
  EIGHTEEN_MONTHS: 18,
  TWO_YEARS: 24,
  FOUR_YEARS: 48,
  SIX_YEARS: 72,
  ELEVEN_YEARS: 132,
  SIXTEEN_YEARS: 192
};

// Vaccination schedule intervals (in days)
const VACCINATION_INTERVALS = {
  MINIMUM_INTERVAL: 28, // 4 weeks
  RECOMMENDED_INTERVAL: 56, // 8 weeks
  MAXIMUM_CATCH_UP: 365 // 1 year
};

// System limits
const SYSTEM_LIMITS = {
  MAX_CHILDREN_PER_PARENT: 10,
  MAX_VACCINES_PER_CHILD: 50,
  MAX_NOTIFICATIONS_PER_USER: 100,
  MAX_LOGIN_ATTEMPTS: 5,
  ACCOUNT_LOCKOUT_TIME: 30 * 60 * 1000, // 30 minutes
  TOKEN_EXPIRY: '7d',
  REFRESH_TOKEN_EXPIRY: '30d'
};

// Email templates
const EMAIL_TEMPLATES = {
  VACCINATION_REMINDER: 'vaccination-reminder',
  VACCINATION_OVERDUE: 'vaccination-overdue',
  VACCINATION_COMPLETED: 'vaccination-completed',
  WELCOME: 'welcome',
  PASSWORD_RESET: 'password-reset',
  ACCOUNT_VERIFICATION: 'account-verification'
};

// SMS templates
const SMS_TEMPLATES = {
  VACCINATION_REMINDER: 'Reminder: {childName} has a {vaccineName} vaccination scheduled for {date}. Please don\'t miss it!',
  VACCINATION_OVERDUE: 'URGENT: {childName}\'s {vaccineName} vaccination is overdue. Please schedule an appointment.',
  APPOINTMENT_CONFIRMATION: 'Confirmed: {childName}\'s {vaccineName} vaccination on {date} at {time}.'
};

// Push notification templates
const PUSH_TEMPLATES = {
  VACCINATION_REMINDER: {
    title: 'Vaccination Reminder',
    body: '{childName} has a vaccination due soon'
  },
  VACCINATION_OVERDUE: {
    title: 'Overdue Vaccination',
    body: '{childName}\'s vaccination is overdue'
  }
};

// Regular expressions
const REGEX_PATTERNS = {
  PHONE: /^\+?[\d\s-()]+$/,
  EMAIL: /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
  NAME: /^[a-zA-Z\s]+$/,
  ZIP_CODE: /^\d{5}(-\d{4})?$/,
  BATCH_NUMBER: /^[A-Z0-9-]+$/,
  LOT_NUMBER: /^[A-Z0-9-]+$/
};

// Date formats
const DATE_FORMATS = {
  API: 'YYYY-MM-DD',
  DISPLAY: 'MMM DD, YYYY',
  FULL: 'MMMM Do, YYYY [at] h:mm A',
  SHORT: 'MM/DD/YYYY',
  ISO: 'YYYY-MM-DDTHH:mm:ss.SSSZ'
};

// Vaccination reminders configuration
const REMINDER_CONFIG = {
  DEFAULT_DAYS_BEFORE: 7,
  EARLY_REMINDER_DAYS: 14,
  OVERDUE_CHECK_DAYS: 1,
  MAX_REMINDERS: 3,
  REMINDER_INTERVALS: [7, 3, 1] // Days before due date
};

module.exports = {
  USER_ROLES,
  VACCINATION_STATUS,
  NOTIFICATION_STATUS,
  DELIVERY_TYPES,
  VACCINE_CATEGORIES,
  GENDER_OPTIONS,
  BLOOD_TYPES,
  ADMINISTRATION_SITES,
  ROUTES_OF_ADMINISTRATION,
  REACTION_SEVERITIES,
  PRIORITY_LEVELS,
  NOTIFICATION_TYPES,
  FILE_UPLOAD,
  COLLECTIONS,
  RESPONSE_MESSAGES,
  AGE_MILESTONES,
  VACCINATION_INTERVALS,
  SYSTEM_LIMITS,
  EMAIL_TEMPLATES,
  SMS_TEMPLATES,
  PUSH_TEMPLATES,
  REGEX_PATTERNS,
  DATE_FORMATS,
  REMINDER_CONFIG
};