// tests/unit/user.test.js
const mongoose = require('mongoose');
const User = require('../../models/User');
const { validateEmail, hashPassword } = require('../../utils/helpers');

describe('User Model Tests', () => {
  beforeEach(async () => {
    await User.deleteMany({});
  });

  describe('User Creation', () => {
    test('should create a valid user', async () => {
      const userData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@test.com',
        password: 'hashedPassword123',
        role: 'parent',
        phone: '+1234567890'
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect(savedUser._id).toBeDefined();
      expect(savedUser.email).toBe(userData.email);
      expect(savedUser.firstName).toBe(userData.firstName);
      expect(savedUser.role).toBe('parent');
      expect(savedUser.isActive).toBe(true);
    });

    test('should fail to create user with invalid email', async () => {
      const userData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'invalid-email',
        password: 'hashedPassword123',
        role: 'parent'
      };

      const user = new User(userData);
      
      await expect(user.save()).rejects.toThrow();
    });

    test('should fail to create user without required fields', async () => {
      const userData = {
        firstName: 'John'
        // Missing required fields
      };

      const user = new User(userData);
      
      await expect(user.save()).rejects.toThrow();
    });

    test('should not allow duplicate email addresses', async () => {
      const userData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@test.com',
        password: 'hashedPassword123',
        role: 'parent'
      };

      await new User(userData).save();
      
      const duplicateUser = new User(userData);
      await expect(duplicateUser.save()).rejects.toThrow();
    });
  });

  describe('User Methods', () => {
    test('should return full name', async () => {
      const user = new User({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@test.com',
        password: 'hashedPassword123',
        role: 'parent'
      });

      expect(user.fullName).toBe('John Doe');
    });

    test('should validate notification preferences', async () => {
      const user = new User({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@test.com',
        password: 'hashedPassword123',
        role: 'parent',
        notificationPreferences: {
          email: true,
          sms: false,
          push: true,
          vaccinationReminders: true,
          overdueAlerts: true
        }
      });

      const savedUser = await user.save();
      expect(savedUser.notificationPreferences.email).toBe(true);
      expect(savedUser.notificationPreferences.sms).toBe(false);
    });
  });
});