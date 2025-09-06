// tests/integration/vaccination.test.js
const request = require('supertest');
const app = require('../../server');
const User = require('../../models/User');
const Child = require('../../models/Child');
const Vaccine = require('../../models/Vaccine');
const VaccinationRecord = require('../../models/VaccinationRecord');
const { generateToken } = require('../../utils/helpers');

describe('Vaccination Integration Tests', () => {
  let parentUser, doctorUser, testChild, testVaccine, parentToken, doctorToken;

  beforeEach(async () => {
    // Clean up database
    await User.deleteMany({});
    await Child.deleteMany({});
    await Vaccine.deleteMany({});
    await VaccinationRecord.deleteMany({});

    // Create test users
    parentUser = await User.create({
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane.smith@test.com',
      password: '$2a$12$hashedPassword',
      role: 'parent',
      isActive: true
    });

    doctorUser = await User.create({
      firstName: 'Dr. John',
      lastName: 'Medical',
      email: 'doctor@test.com',
      password: '$2a$12$hashedPassword',
      role: 'doctor',
      isActive: true
    });

    // Generate tokens
    parentToken = generateToken(parentUser._id, parentUser.role);
    doctorToken = generateToken(doctorUser._id, doctorUser.role);

    // Create test child
    testChild = await Child.create({
      firstName: 'Emma',
      lastName: 'Smith',
      dateOfBirth: new Date('2020-05-15'),
      gender: 'female',
      parent: parentUser._id
    });

    // Create test vaccine
    testVaccine = await Vaccine.create({
      name: 'MMR',
      fullName: 'Measles, Mumps, and Rubella',
      type: 'combination',
      manufacturer: 'Test Manufacturer',
      description: 'Test vaccine description',
      schedule: [{
        doseNumber: 1,
        ageInDays: 365,
        description: 'First dose at 12 months'
      }],
      ageGroups: [{
        minAge: 12,
        maxAge: 15,
        unit: 'months',
        description: 'First dose window'
      }],
      isActive: true
    });
  });

  describe('POST /api/vaccination-records', () => {
    test('should create vaccination record successfully', async () => {
      const vaccinationData = {
        child: testChild._id,
        vaccine: testVaccine._id,
        doseNumber: 1,
        scheduledDate: new Date('2024-12-25'),
        notes: 'Regular checkup vaccination'
      };

      const response = await request(app)
        .post('/api/vaccination-records')
        .set('Authorization', `Bearer ${parentToken}`)
        .send(vaccinationData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.record.child).toBe(testChild._id.toString());
      expect(response.body.data.record.vaccine).toBeDefined();
      expect(response.body.data.record.status).toBe('scheduled');

      // Verify record was created in database
      const record = await VaccinationRecord.findOne({
        child: testChild._id,
        vaccine: testVaccine._id
      });
      expect(record).toBeTruthy();
    });

    test('should fail to create duplicate vaccination record', async () => {
      const vaccinationData = {
        child: testChild._id,
        vaccine: testVaccine._id,
        doseNumber: 1,
        scheduledDate: new Date('2024-12-25'),
        notes: 'Regular checkup vaccination'
      };

      // Create first record
      await request(app)
        .post('/api/vaccination-records')
        .set('Authorization', `Bearer ${parentToken}`)
        .send(vaccinationData)
        .expect(201);

      // Try to create duplicate
      const response = await request(app)
        .post('/api/vaccination-records')
        .set('Authorization', `Bearer ${parentToken}`)
        .send(vaccinationData)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Duplicate');
    });

    test('should fail without authentication', async () => {
      const vaccinationData = {
        child: testChild._id,
        vaccine: testVaccine._id,
        doseNumber: 1,
        scheduledDate: new Date('2024-12-25')
      };

      const response = await request(app)
        .post('/api/vaccination-records')
        .send(vaccinationData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('token');
    });
  });

  describe('GET /api/vaccination-records/child/:childId', () => {
    let vaccinationRecord;

    beforeEach(async () => {
      vaccinationRecord = await VaccinationRecord.create({
        child: testChild._id,
        vaccine: testVaccine._id,
        doseNumber: 1,
        scheduledDate: new Date('2024-12-25'),
        status: 'scheduled',
        createdBy: parentUser._id
      });
    });

    test('should get child vaccination records successfully', async () => {
      const response = await request(app)
        .get(`/api/vaccination-records/child/${testChild._id}`)
        .set('Authorization', `Bearer ${parentToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.records).toHaveLength(1);
      expect(response.body.data.records[0].child).toBe(testChild._id.toString());
    });

    test('should fail to access other parent\'s child records', async () => {
      // Create another parent and child
      const otherParent = await User.create({
        firstName: 'Other',
        lastName: 'Parent',
        email: 'other@test.com',
        password: '$2a$12$hashedPassword',
        role: 'parent',
        isActive: true
      });

      const otherChild = await Child.create({
        firstName: 'Other',
        lastName: 'Child',
        dateOfBirth: new Date('2021-01-01'),
        gender: 'male',
        parent: otherParent._id
      });

      const response = await request(app)
        .get(`/api/vaccination-records/child/${otherChild._id}`)
        .set('Authorization', `Bearer ${parentToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('access');
    });
  });

  describe('PATCH /api/vaccination-records/:id/complete', () => {
    let vaccinationRecord;

    beforeEach(async () => {
      vaccinationRecord = await VaccinationRecord.create({
        child: testChild._id,
        vaccine: testVaccine._id,
        doseNumber: 1,
        scheduledDate: new Date('2024-12-20'),
        status: 'scheduled',
        createdBy: parentUser._id
      });
    });

    test('should complete vaccination successfully (doctor)', async () => {
      const completionData = {
        administeredDate: new Date(),
        administeredBy: 'Dr. Medical',
        location: 'Test Clinic',
        batchNumber: 'BATCH123',
        notes: 'Vaccination completed successfully'
      };

      const response = await request(app)
        .patch(`/api/vaccination-records/${vaccinationRecord._id}/complete`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send(completionData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.record.status).toBe('completed');
      expect(response.body.data.record.administeredBy).toBe(completionData.administeredBy);

      // Verify in database
      const updatedRecord = await VaccinationRecord.findById(vaccinationRecord._id);
      expect(updatedRecord.status).toBe('completed');
      expect(updatedRecord.completedAt).toBeDefined();
    });

    test('should fail completion by parent (insufficient permissions)', async () => {
      const completionData = {
        administeredDate: new Date(),
        administeredBy: 'Dr. Medical'
      };

      const response = await request(app)
        .patch(`/api/vaccination-records/${vaccinationRecord._id}/complete`)
        .set('Authorization', `Bearer ${parentToken}`)
        .send(completionData)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('permission');
    });
  });

  describe('GET /api/vaccination-records/upcoming', () => {
    beforeEach(async () => {
      // Create upcoming vaccination
      await VaccinationRecord.create({
        child: testChild._id,
        vaccine: testVaccine._id,
        doseNumber: 1,
        scheduledDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        status: 'scheduled',
        createdBy: parentUser._id
      });

      // Create overdue vaccination
      await VaccinationRecord.create({
        child: testChild._id,
        vaccine: testVaccine._id,
        doseNumber: 2,
        scheduledDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
        status: 'scheduled',
        createdBy: parentUser._id
      });
    });

    test('should get upcoming vaccinations', async () => {
      const response = await request(app)
        .get('/api/vaccination-records/upcoming?days=30')
        .set('Authorization', `Bearer ${parentToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.records).toHaveLength(1);
      expect(response.body.data.daysAhead).toBe(30);
    });
  });

  describe('GET /api/vaccination-records/overdue', () => {
    test('should get overdue vaccinations', async () => {
      const response = await request(app)
        .get('/api/vaccination-records/overdue')
        .set('Authorization', `Bearer ${parentToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.records).toHaveLength(1);
      expect(response.body.data.records[0].daysOverdue).toBeGreaterThan(0);
    });
  });
});