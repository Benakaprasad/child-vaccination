// tests/unit/vaccine.test.js
const mongoose = require('mongoose');
const Vaccine = require('../../models/Vaccine');

describe('Vaccine Model Tests', () => {
  beforeEach(async () => {
    await Vaccine.deleteMany({});
  });

  describe('Vaccine Creation', () => {
    test('should create a valid vaccine', async () => {
      const vaccineData = {
        name: 'MMR',
        fullName: 'Measles, Mumps, and Rubella',
        type: 'combination',
        manufacturer: 'Merck & Co.',
        description: 'Protection against measles, mumps, and rubella',
        schedule: [
          {
            doseNumber: 1,
            ageInDays: 365, // 12 months
            description: 'First dose at 12 months'
          },
          {
            doseNumber: 2,
            ageInDays: 1460, // 4 years
            description: 'Second dose at 4 years'
          }
        ],
        ageGroups: [
          {
            minAge: 12,
            maxAge: 15,
            unit: 'months',
            description: 'First dose window'
          }
        ],
        sideEffects: ['mild fever', 'soreness at injection site'],
        contraindications: ['immunocompromised', 'pregnancy'],
        isActive: true
      };

      const vaccine = new Vaccine(vaccineData);
      const savedVaccine = await vaccine.save();

      expect(savedVaccine._id).toBeDefined();
      expect(savedVaccine.name).toBe(vaccineData.name);
      expect(savedVaccine.schedule).toHaveLength(2);
      expect(savedVaccine.isActive).toBe(true);
    });

    test('should fail to create vaccine without required fields', async () => {
      const vaccineData = {
        name: 'Incomplete Vaccine'
        // Missing required fields
      };

      const vaccine = new Vaccine(vaccineData);
      await expect(vaccine.save()).rejects.toThrow();
    });

    test('should validate schedule array', async () => {
      const vaccineData = {
        name: 'Test Vaccine',
        fullName: 'Test Vaccine Full Name',
        type: 'individual',
        manufacturer: 'Test Manufacturer',
        description: 'Test description',
        schedule: [], // Empty schedule should fail
        ageGroups: [],
        isActive: true
      };

      const vaccine = new Vaccine(vaccineData);
      await expect(vaccine.save()).rejects.toThrow();
    });

    test('should not allow duplicate vaccine names', async () => {
      const vaccineData = {
        name: 'MMR',
        fullName: 'Measles, Mumps, and Rubella',
        type: 'combination',
        manufacturer: 'Merck & Co.',
        description: 'Protection against measles, mumps, and rubella',
        schedule: [
          {
            doseNumber: 1,
            ageInDays: 365,
            description: 'First dose'
          }
        ],
        ageGroups: [],
        isActive: true
      };

      await new Vaccine(vaccineData).save();
      
      const duplicateVaccine = new Vaccine(vaccineData);
      await expect(duplicateVaccine.save()).rejects.toThrow();
    });
  });

  describe('Vaccine Methods', () => {
    test('should find active vaccines', async () => {
      await new Vaccine({
        name: 'Active Vaccine',
        fullName: 'Active Vaccine Full Name',
        type: 'individual',
        manufacturer: 'Test Manufacturer',
        description: 'Test description',
        schedule: [{ doseNumber: 1, ageInDays: 365, description: 'First dose' }],
        ageGroups: [],
        isActive: true
      }).save();

      await new Vaccine({
        name: 'Inactive Vaccine',
        fullName: 'Inactive Vaccine Full Name',
        type: 'individual',
        manufacturer: 'Test Manufacturer',
        description: 'Test description',
        schedule: [{ doseNumber: 1, ageInDays: 365, description: 'First dose' }],
        ageGroups: [],
        isActive: false
      }).save();

      const activeVaccines = await Vaccine.find({ isActive: true });
      expect(activeVaccines).toHaveLength(1);
      expect(activeVaccines[0].name).toBe('Active Vaccine');
    });
  });
});