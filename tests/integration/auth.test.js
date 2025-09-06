// tests/integration/auth.test.js
const request = require('supertest');
const app = require('../../server');
const User = require('../../models/User');
const { generateToken } = require('../../utils/helpers');

describe('Authentication Integration Tests', () => {
  beforeEach(async () => {
    await User.deleteMany({});
  });

  describe('POST /api/auth/register', () => {
    test('should register a new user successfully', async () => {
      const userData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@test.com',
        password: 'SecurePass123!',
        confirmPassword: 'SecurePass123!',
        role: 'parent',
        phone: '+1234567890'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('registered successfully');
      expect(response.body.data.user.email).toBe(userData.email);
      expect(response.body.data.token).toBeDefined();

      // Verify user was created in database
      const user = await User.findOne({ email: userData.email });
      expect(user).toBeTruthy();
      expect(user.firstName).toBe(userData.firstName);
    });

    test('should fail registration with invalid email', async () => {
      const userData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'invalid-email',
        password: 'SecurePass123!',
        confirmPassword: 'SecurePass123!',
        role: 'parent'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('validation');
    });

    test('should fail registration with password mismatch', async () => {
      const userData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@test.com',
        password: 'SecurePass123!',
        confirmPassword: 'DifferentPass123!',
        role: 'parent'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('password');
    });

    test('should fail registration with duplicate email', async () => {
      const userData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@test.com',
        password: 'SecurePass123!',
        confirmPassword: 'SecurePass123!',
        role: 'parent'
      };

      // Register first user
      await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      // Try to register with same email
      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already exists');
    });
  });

  describe('POST /api/auth/login', () => {
    let testUser;

    beforeEach(async () => {
      // Create test user
      testUser = await User.create({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@test.com',
        password: '$2a$12$hashedPassword', // Mock hashed password
        role: 'parent',
        isActive: true
      });
    });

    test('should login successfully with valid credentials', async () => {
      const loginData = {
        email: 'john.doe@test.com',
        password: 'correctPassword'
      };

      // Mock password comparison to return true
      jest.spyOn(require('bcryptjs'), 'compare').mockResolvedValue(true);

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('successful');
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.user.email).toBe(loginData.email);
    });

    test('should fail login with invalid credentials', async () => {
      const loginData = {
        email: 'john.doe@test.com',
        password: 'wrongPassword'
      };

      // Mock password comparison to return false
      jest.spyOn(require('bcryptjs'), 'compare').mockResolvedValue(false);

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid credentials');
    });

    test('should fail login with non-existent user', async () => {
      const loginData = {
        email: 'nonexistent@test.com',
        password: 'anyPassword'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid credentials');
    });
  });

  describe('POST /api/auth/refresh', () => {
    let testUser, refreshToken;

    beforeEach(async () => {
      testUser = await User.create({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@test.com',
        password: '$2a$12$hashedPassword',
        role: 'parent',
        isActive: true
      });

      refreshToken = 'valid_refresh_token';
      testUser.refreshToken = refreshToken;
      await testUser.save();
    });

    test('should refresh token successfully', async () => {
      // Mock JWT verification
      jest.spyOn(require('jsonwebtoken'), 'verify').mockReturnValue({
        userId: testUser._id.toString(),
        email: testUser.email
      });

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.accessToken).toBeDefined();
    });

    test('should fail with invalid refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid_token' })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid refresh token');
    });
  });
});