// tests/setup.js
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

// Setup before all tests
beforeAll(async () => {
  try {
    // Start in-memory MongoDB instance
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    // Connect mongoose to the in-memory database
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Connected to in-memory MongoDB for testing');
  } catch (error) {
    console.error('Error setting up test database:', error);
    process.exit(1);
  }
});

// Cleanup after all tests
afterAll(async () => {
  try {
    // Close mongoose connection
    await mongoose.connection.close();
    
    // Stop the in-memory MongoDB instance
    if (mongoServer) {
      await mongoServer.stop();
    }

    console.log('Test database cleanup completed');
  } catch (error) {
    console.error('Error cleaning up test database:', error);
  }
});

// Clear all collections before each test
beforeEach(async () => {
  const collections = mongoose.connection.collections;

  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
});

// Global test configuration
jest.setTimeout(30000); // 30 seconds timeout for tests

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing-only';
process.env.EMAIL_SERVICE = 'test';
process.env.SMS_SERVICE = 'test';

// Mock external services
jest.mock('../services/emailService', () => ({
  sendEmail: jest.fn().mockResolvedValue(true),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
  sendVaccinationReminder: jest.fn().mockResolvedValue(true),
  sendWelcomeEmail: jest.fn().mockResolvedValue(true)
}));

jest.mock('../services/smsService', () => ({
  sendSMS: jest.fn().mockResolvedValue(true),
  sendVaccinationReminder: jest.fn().mockResolvedValue(true),
  sendOTP: jest.fn().mockResolvedValue(true)
}));

jest.mock('../services/notificationService', () => ({
  sendNotification: jest.fn().mockResolvedValue({ success: true }),
  createVaccinationReminder: jest.fn().mockResolvedValue({ _id: 'notification_id' }),
  createOverdueNotification: jest.fn().mockResolvedValue({ _id: 'notification_id' }),
  sendBulkNotifications: jest.fn().mockResolvedValue({ successful: 5, failed: 0 })
}));

// Helper functions for tests
global.testHelpers = {
  // Create a test user
  createTestUser: async (userData = {}) => {
    const User = require('../models/User');
    const defaultUserData = {
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      password: '$2a$12$hashedPassword',
      role: 'parent',
      isActive: true,
      ...userData
    };
    return await User.create(defaultUserData);
  },

  // Create a test child
  createTestChild: async (parentId, childData = {}) => {
    const Child = require('../models/Child');
    const defaultChildData = {
      firstName: 'Test',
      lastName: 'Child',
      dateOfBirth: new Date('2020-01-01'),
      gender: 'female',
      parent: parentId,
      ...childData
    };
    return await Child.create(defaultChildData);
  },

  // Create a test vaccine
  createTestVaccine: async (vaccineData = {}) => {
    const Vaccine = require('../models/Vaccine');
    const defaultVaccineData = {
      name: 'Test Vaccine',
      fullName: 'Test Vaccine Full Name',
      type: 'individual',
      manufacturer: 'Test Manufacturer',
      description: 'Test vaccine description',
      schedule: [{
        doseNumber: 1,
        ageInDays: 365,
        description: 'First dose'
      }],
      ageGroups: [{
        minAge: 12,
        maxAge: 24,
        unit: 'months',
        description: 'Test age group'
      }],
      isActive: true,
      ...vaccineData
    };
    return await Vaccine.create(defaultVaccineData);
  },

  // Create a test vaccination record
  createTestVaccinationRecord: async (childId, vaccineId, recordData = {}) => {
    const VaccinationRecord = require('../models/VaccinationRecord');
    const defaultRecordData = {
      child: childId,
      vaccine: vaccineId,
      doseNumber: 1,
      scheduledDate: new Date(),
      status: 'scheduled',
      ...recordData
    };
    return await VaccinationRecord.create(defaultRecordData);
  },

  // Generate test JWT token
  generateTestToken: (userId, role = 'parent') => {
    const jwt = require('jsonwebtoken');
    return jwt.sign(
      { userId, role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  },

  // Clean specific collection
  cleanCollection: async (collectionName) => {
    const collection = mongoose.connection.collections[collectionName];
    if (collection) {
      await collection.deleteMany({});
    }
  },

  // Wait for a specific time (useful for testing time-dependent features)
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  // Create date helpers
  daysFromNow: (days) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
  },

  daysAgo: (days) => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
  },

  monthsFromNow: (months) => {
    const date = new Date();
    date.setMonth(date.getMonth() + months);
    return date;
  },

  yearsFromNow: (years) => {
    const date = new Date();
    date.setFullYear(date.getFullYear() + years);
    return date;
  }
};

// Console override for cleaner test output
const originalConsole = console;
global.console = {
  ...originalConsole,
  // Suppress console.log in tests unless NODE_ENV is 'test-verbose'
  log: process.env.NODE_ENV === 'test-verbose' ? originalConsole.log : () => {},
  info: process.env.NODE_ENV === 'test-verbose' ? originalConsole.info : () => {},
  warn: originalConsole.warn,
  error: originalConsole.error
};

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process in tests, just log the error
});

module.exports = {
  mongoServer,
  testHelpers: global.testHelpers
};