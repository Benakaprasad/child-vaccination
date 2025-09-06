// tests/unit/child.test.js
const mongoose = require('mongoose');
const Child = require('../../models/Child');
const User = require('../../models/User');
const { calculateAge } = require('../../utils/helpers');

describe('Child Model Tests', () => {
  let parentUser;

  beforeEach(async () => {
    await Child.deleteMany({});
    await User.deleteMany({});

    parentUser = await new User({
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane.smith@test.com',
      password: 'hashedPassword123',
      role: 'parent'
    }).save();
  });

  describe('Child Creation', () => {
    test('should create a valid child', async () => {
      const childData = {
        firstName: 'Emma',
        lastName: 'Smith',
        dateOfBirth: new Date('2020-05-15'),
        gender: 'female',
        parent: parentUser._id,
        bloodType: 'O+'
      };

      const child = new Child(childData);
      const savedChild = await child.save();

      expect(savedChild._id).toBeDefined();
      expect(savedChild.firstName).toBe(childData.firstName);
      expect(savedChild.parent.toString()).toBe(parentUser._id.toString());
      expect(savedChild.gender).toBe('female');
    });

    test('should fail to create child without required fields', async () => {
      const childData = {
        firstName: 'Emma'
        // Missing required fields
      };

      const child = new Child(childData);
      await expect(child.save()).rejects.toThrow();
    });

    test('should validate gender enum values', async () => {
      const childData = {
        firstName: 'Emma',
        lastName: 'Smith',
        dateOfBirth: new Date('2020-05-15'),
        gender: 'invalid_gender',
        parent: parentUser._id
      };

      const child = new Child(childData);
      await expect(child.save()).rejects.toThrow();
    });
  });

  describe('Child Age Calculations', () => {
    test('should calculate age correctly', () => {
      const birthDate = new Date();
      birthDate.setFullYear(birthDate.getFullYear() - 5); // 5 years ago

      const age = calculateAge(birthDate);
      expect(age).toBe(5);
    });

    test('should calculate age in months', () => {
      const birthDate = new Date();
      birthDate.setMonth(birthDate.getMonth() - 18); // 18 months ago

      const ageInMonths = calculateAge(birthDate, 'months');
      expect(ageInMonths).toBe(18);
    });
  });
});
