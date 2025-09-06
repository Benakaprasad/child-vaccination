const User = require('../models/User');
const { 
  hashPassword, 
  comparePassword, 
  generateToken, 
  createApiResponse,
  generateOTP 
} = require('../utils/helpers');
const { 
  HTTP_STATUS, 
  ERROR_MESSAGES, 
  SUCCESS_MESSAGES,
  USER_ROLES 
} = require('../utils/constants');
const emailService = require('../services/emailService');
const { logger } = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

class AuthController {
  /**
   * Register a new user account
   */
  async register(req, res, next) {
    try {
      const {
        firstName,
        lastName,
        email,
        password,
        phone,
        role = 'parent',
        address,
        preferences
      } = req.body;

      // Validate required fields
      const requiredFields = ['firstName', 'lastName', 'email', 'password'];
      const missingFields = requiredFields.filter(field => !req.body[field]);
      
      if (missingFields.length > 0) {
        throw new AppError(`Missing required fields: ${missingFields.join(', ')}`, 400);
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new AppError('Invalid email format', 400);
      }

      // Validate password strength
      if (password.length < 8) {
        throw new AppError('Password must be at least 8 characters long', 400);
      }

      // Additional password complexity check
      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;
      if (!passwordRegex.test(password)) {
        throw new AppError('Password must contain at least one lowercase letter, one uppercase letter, and one number', 400);
      }

      // Validate role
      if (role && !Object.values(USER_ROLES).includes(role)) {
        throw new AppError('Invalid role specified', 400);
      }

      // Validate phone format if provided
      if (phone) {
        const phoneRegex = /^\+?[\d\s\-\(\)]+$/;
        if (!phoneRegex.test(phone)) {
          throw new AppError('Invalid phone number format', 400);
        }
      }

      const normalizedEmail = email.toLowerCase().trim();

      // Check if user already exists
      const existingUser = await User.findOne({ 
        email: normalizedEmail,
        isActive: { $ne: false } 
      });
      
      if (existingUser) {
        throw new AppError(ERROR_MESSAGES.USER_ALREADY_EXISTS || 'User already exists', 409);
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

      // Generate email verification token
      const emailVerificationToken = crypto.randomBytes(32).toString('hex');
      const hashedEmailToken = crypto.createHash('sha256').update(emailVerificationToken).digest('hex');

      // Create new user
      const user = new User({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        phone: phone?.trim(),
        role,
        address: address ? {
          street: address.street?.trim(),
          city: address.city?.trim(),
          state: address.state?.trim(),
          zipCode: address.zipCode?.trim(),
          country: address.country?.trim()
        } : undefined,
        preferences: preferences || {},
        emailVerificationToken: hashedEmailToken,
        emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        isEmailVerified: false
      });

      await user.save();

      // Generate JWT token
      const token = generateToken({ 
        userId: user._id, 
        email: user.email, 
        role: user.role 
      });

      // Remove sensitive data from response
      const userResponse = user.toObject();
      delete userResponse.password;
      delete userResponse.emailVerificationToken;
      delete userResponse.resetPasswordToken;

      // Send welcome and verification email
      try {
        await emailService.sendWelcomeEmail(user, emailVerificationToken);
      } catch (emailError) {
        logger.error('Failed to send welcome email:', emailError);
        // Don't fail registration if email fails, but log it
      }

      logger.info(`New user registered: ${user.email} with role: ${user.role}`);

      res.status(HTTP_STATUS.CREATED).json(
        createApiResponse(
          true, 
          SUCCESS_MESSAGES.USER_REGISTERED || 'User registered successfully',
          {
            user: userResponse,
            token,
            emailVerificationRequired: true
          }
        )
      );

    } catch (error) {
      logger.error('User registration error:', error);
      next(error);
    }
  }

  /**
   * Authenticate user login
   */
  async login(req, res, next) {
    try {
      const { email, password, rememberMe = false } = req.body;

      // Validate required fields
      if (!email || !password) {
        throw new AppError('Email and password are required', 400);
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new AppError('Invalid email format', 400);
      }

      const normalizedEmail = email.toLowerCase().trim();

      // Find user by email
      const user = await User.findOne({ 
        email: normalizedEmail,
        isActive: true
      });

      if (!user) {
        // Use same error message to prevent email enumeration
        throw new AppError(ERROR_MESSAGES.INVALID_CREDENTIALS || 'Invalid credentials', 401);
      }

      // Verify password
      const isValidPassword = await comparePassword(password, user.password);
      if (!isValidPassword) {
        // Log failed login attempt
        logger.warn(`Failed login attempt for email: ${normalizedEmail}`);
        throw new AppError(ERROR_MESSAGES.INVALID_CREDENTIALS || 'Invalid credentials', 401);
      }

      // Check if email is verified (optional requirement)
      if (!user.isEmailVerified) {
        logger.info(`Login attempt with unverified email: ${normalizedEmail}`);
        // You might want to enforce email verification
        // throw new AppError('Please verify your email before logging in', 403);
      }

      // Update last login and login count
      const updateData = {
        lastLogin: new Date(),
        $inc: { loginCount: 1 }
      };
      
      await User.findByIdAndUpdate(user._id, updateData);

      // Generate JWT token with appropriate expiration
      const tokenExpiration = rememberMe ? '30d' : '24h';
      const token = generateToken({ 
        userId: user._id, 
        email: user.email, 
        role: user.role 
      }, tokenExpiration);

      // Remove sensitive data from response
      const userResponse = user.toObject();
      delete userResponse.password;
      delete userResponse.emailVerificationToken;
      delete userResponse.resetPasswordToken;

      logger.info(`User logged in: ${user.email}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(
          true, 
          SUCCESS_MESSAGES.LOGIN_SUCCESS || 'Login successful',
          {
            user: userResponse,
            token,
            expiresIn: tokenExpiration
          }
        )
      );

    } catch (error) {
      logger.error('User login error:', error);
      next(error);
    }
  }

  /**
   * Get current user profile
   */
  async getProfile(req, res, next) {
    try {
      const userId = req.user._id || req.user.userId;

      const user = await User.findById(userId)
        .populate('children', 'firstName lastName dateOfBirth gender profileImage')
        .select('-password -emailVerificationToken -resetPasswordToken');

      if (!user) {
        throw new AppError(ERROR_MESSAGES.USER_NOT_FOUND || 'User not found', 404);
      }

      // Add computed fields
      const userProfile = {
        ...user.toObject(),
        profileCompleteness: this.calculateProfileCompleteness(user),
        accountAge: Math.floor((new Date() - user.createdAt) / (1000 * 60 * 60 * 24)) // days
      };

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Profile retrieved successfully', { user: userProfile })
      );

    } catch (error) {
      logger.error('Get profile error:', error);
      next(error);
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(req, res, next) {
    try {
      const userId = req.user._id || req.user.userId;
      const updates = req.body;

      // Remove fields that shouldn't be updated via this endpoint
      const protectedFields = [
        'email', 'password', 'role', 'children', 'isEmailVerified', 
        'emailVerificationToken', 'resetPasswordToken', 'loginCount', 
        'lastLogin', 'createdAt', 'updatedAt'
      ];
      protectedFields.forEach(field => delete updates[field]);

      // Validate phone format if being updated
      if (updates.phone) {
        const phoneRegex = /^\+?[\d\s\-\(\)]+$/;
        if (!phoneRegex.test(updates.phone)) {
          throw new AppError('Invalid phone number format', 400);
        }
        updates.phone = updates.phone.trim();
      }

      // Validate and clean address if being updated
      if (updates.address && typeof updates.address === 'object') {
        const cleanAddress = {};
        ['street', 'city', 'state', 'zipCode', 'country'].forEach(field => {
          if (updates.address[field]) {
            cleanAddress[field] = updates.address[field].trim();
          }
        });
        updates.address = cleanAddress;
      }

      // Clean text fields
      if (updates.firstName) updates.firstName = updates.firstName.trim();
      if (updates.lastName) updates.lastName = updates.lastName.trim();

      const user = await User.findByIdAndUpdate(
        userId,
        { $set: updates },
        { new: true, runValidators: true }
      ).select('-password -emailVerificationToken -resetPasswordToken');

      if (!user) {
        throw new AppError(ERROR_MESSAGES.USER_NOT_FOUND || 'User not found', 404);
      }

      logger.info(`User profile updated: ${user.email}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, SUCCESS_MESSAGES.PROFILE_UPDATED || 'Profile updated successfully', { user })
      );

    } catch (error) {
      logger.error('Update profile error:', error);
      next(error);
    }
  }

  /**
   * Change user password
   */
  async changePassword(req, res, next) {
    try {
      const { currentPassword, newPassword, confirmPassword } = req.body;
      const userId = req.user._id || req.user.userId;

      // Validate required fields
      if (!currentPassword || !newPassword || !confirmPassword) {
        throw new AppError('Current password, new password, and confirmation are required', 400);
      }

      // Validate new password confirmation
      if (newPassword !== confirmPassword) {
        throw new AppError('New password and confirmation do not match', 400);
      }

      // Validate new password strength
      if (newPassword.length < 8) {
        throw new AppError('New password must be at least 8 characters long', 400);
      }

      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;
      if (!passwordRegex.test(newPassword)) {
        throw new AppError('New password must contain at least one lowercase letter, one uppercase letter, and one number', 400);
      }

      // Prevent using the same password
      if (currentPassword === newPassword) {
        throw new AppError('New password must be different from current password', 400);
      }

      const user = await User.findById(userId);
      if (!user) {
        throw new AppError(ERROR_MESSAGES.USER_NOT_FOUND || 'User not found', 404);
      }

      // Verify current password
      const isValidPassword = await comparePassword(currentPassword, user.password);
      if (!isValidPassword) {
        throw new AppError('Current password is incorrect', 401);
      }

      // Hash new password
      const hashedNewPassword = await hashPassword(newPassword);
      
      // Update password and password change timestamp
      user.password = hashedNewPassword;
      user.passwordChangedAt = new Date();
      await user.save();

      logger.info(`Password changed for user: ${user.email}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Password changed successfully')
      );

    } catch (error) {
      logger.error('Change password error:', error);
      next(error);
    }
  }

  /**
   * Initiate password reset process
   */
  async forgotPassword(req, res, next) {
    try {
      const { email } = req.body;

      if (!email) {
        throw new AppError('Email is required', 400);
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new AppError('Invalid email format', 400);
      }

      const normalizedEmail = email.toLowerCase().trim();

      const user = await User.findOne({ 
        email: normalizedEmail,
        isActive: true
      });

      // Always return success to prevent email enumeration
      const successMessage = 'If an account with that email exists, a password reset link has been sent';

      if (!user) {
        logger.info(`Password reset requested for non-existent email: ${normalizedEmail}`);
        return res.status(HTTP_STATUS.OK).json(
          createApiResponse(true, successMessage)
        );
      }

      // Check if reset was requested recently (prevent spam)
      if (user.resetPasswordExpires && user.resetPasswordExpires > new Date()) {
        const timeLeft = Math.ceil((user.resetPasswordExpires - new Date()) / (1000 * 60));
        logger.info(`Password reset attempted too soon for: ${normalizedEmail}, ${timeLeft} minutes left`);
        return res.status(HTTP_STATUS.OK).json(
          createApiResponse(true, successMessage)
        );
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const hashedResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
      const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Save reset token to user
      user.resetPasswordToken = hashedResetToken;
      user.resetPasswordExpires = resetTokenExpires;
      await user.save();

      // Send reset email
      try {
        await emailService.sendPasswordResetEmail(user, resetToken);
        logger.info(`Password reset email sent to: ${user.email}`);
      } catch (emailError) {
        logger.error('Failed to send password reset email:', emailError);
        
        // Clear reset token if email fails
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();
        
        throw new AppError('Failed to send password reset email. Please try again later.', 500);
      }

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, successMessage)
      );

    } catch (error) {
      logger.error('Forgot password error:', error);
      next(error);
    }
  }

  /**
   * Reset password using reset token
   */
  async resetPassword(req, res, next) {
    try {
      const { token, newPassword, confirmPassword } = req.body;

      // Validate required fields
      if (!token || !newPassword || !confirmPassword) {
        throw new AppError('Token, new password, and confirmation are required', 400);
      }

      // Validate password confirmation
      if (newPassword !== confirmPassword) {
        throw new AppError('Password and confirmation do not match', 400);
      }

      // Validate password strength
      if (newPassword.length < 8) {
        throw new AppError('Password must be at least 8 characters long', 400);
      }

      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;
      if (!passwordRegex.test(newPassword)) {
        throw new AppError('Password must contain at least one lowercase letter, one uppercase letter, and one number', 400);
      }

      // Hash token
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

      // Find user with valid reset token
      const user = await User.findOne({
        resetPasswordToken: hashedToken,
        resetPasswordExpires: { $gt: Date.now() },
        isActive: true
      });

      if (!user) {
        throw new AppError('Invalid or expired reset token', 400);
      }

      // Hash new password
      const hashedNewPassword = await hashPassword(newPassword);

      // Update password and clear reset token
      user.password = hashedNewPassword;
      user.passwordChangedAt = new Date();
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();

      logger.info(`Password reset completed for user: ${user.email}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Password has been reset successfully')
      );

    } catch (error) {
      logger.error('Reset password error:', error);
      next(error);
    }
  }

  /**
   * User logout (stateless JWT - client-side action)
   */
  async logout(req, res, next) {
    try {
      // In a stateless JWT system, logout is handled client-side
      // We can log the action for audit purposes
      const userEmail = req.user?.email || 'Unknown';
      logger.info(`User logged out: ${userEmail}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, SUCCESS_MESSAGES.LOGOUT_SUCCESS || 'Logged out successfully')
      );

    } catch (error) {
      logger.error('Logout error:', error);
      next(error);
    }
  }

  /**
   * Verify email address
   */
  async verifyEmail(req, res, next) {
    try {
      const { token } = req.params;

      if (!token) {
        throw new AppError('Verification token is required', 400);
      }

      // Hash token
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

      const user = await User.findOne({
        emailVerificationToken: hashedToken,
        emailVerificationExpires: { $gt: Date.now() },
        isActive: true
      });

      if (!user) {
        throw new AppError('Invalid or expired verification token', 400);
      }

      // Check if already verified
      if (user.isEmailVerified) {
        return res.status(HTTP_STATUS.OK).json(
          createApiResponse(true, 'Email is already verified')
        );
      }

      // Mark email as verified
      user.isEmailVerified = true;
      user.emailVerificationToken = undefined;
      user.emailVerificationExpires = undefined;
      user.emailVerifiedAt = new Date();
      await user.save();

      logger.info(`Email verified for user: ${user.email}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Email verified successfully')
      );

    } catch (error) {
      logger.error('Email verification error:', error);
      next(error);
    }
  }

  /**
   * Resend email verification
   */
  async resendEmailVerification(req, res, next) {
    try {
      const userId = req.user._id || req.user.userId;

      const user = await User.findById(userId);
      if (!user) {
        throw new AppError(ERROR_MESSAGES.USER_NOT_FOUND || 'User not found', 404);
      }

      if (user.isEmailVerified) {
        return res.status(HTTP_STATUS.OK).json(
          createApiResponse(true, 'Email is already verified')
        );
      }

      // Check if verification was sent recently (prevent spam)
      if (user.emailVerificationExpires && user.emailVerificationExpires > new Date()) {
        const timeLeft = Math.ceil((user.emailVerificationExpires - new Date()) / (1000 * 60));
        throw new AppError(`Please wait ${timeLeft} minutes before requesting another verification email`, 429);
      }

      // Generate new verification token
      const emailVerificationToken = crypto.randomBytes(32).toString('hex');
      const hashedEmailToken = crypto.createHash('sha256').update(emailVerificationToken).digest('hex');

      user.emailVerificationToken = hashedEmailToken;
      user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      await user.save();

      // Send verification email
      try {
        await emailService.sendEmailVerification(user, emailVerificationToken);
        logger.info(`Email verification resent to: ${user.email}`);
      } catch (emailError) {
        logger.error('Failed to send verification email:', emailError);
        throw new AppError('Failed to send verification email. Please try again later.', 500);
      }

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Verification email sent successfully')
      );

    } catch (error) {
      logger.error('Resend email verification error:', error);
      next(error);
    }
  }

  /**
   * Refresh JWT token
   */
  async refreshToken(req, res, next) {
    try {
      const userId = req.user._id || req.user.userId;

      const user = await User.findById(userId).select('-password -emailVerificationToken -resetPasswordToken');
      
      if (!user || !user.isActive) {
        throw new AppError(ERROR_MESSAGES.UNAUTHORIZED || 'Unauthorized', 401);
      }

      // Generate new token
      const token = generateToken({ 
        userId: user._id, 
        email: user.email, 
        role: user.role 
      });

      logger.info(`Token refreshed for user: ${user.email}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Token refreshed successfully', { 
          token,
          user
        })
      );

    } catch (error) {
      logger.error('Refresh token error:', error);
      next(error);
    }
  }

  /**
   * Deactivate user account
   */
  async deactivateAccount(req, res, next) {
    try {
      const { password, reason } = req.body;
      const userId = req.user._id || req.user.userId;

      if (!password) {
        throw new AppError('Password is required to deactivate account', 400);
      }

      const user = await User.findById(userId);
      if (!user) {
        throw new AppError(ERROR_MESSAGES.USER_NOT_FOUND || 'User not found', 404);
      }

      // Verify password
      const isValidPassword = await comparePassword(password, user.password);
      if (!isValidPassword) {
        throw new AppError('Password is incorrect', 401);
      }

      // Deactivate account with audit trail
      user.isActive = false;
      user.deactivatedAt = new Date();
      user.deactivationReason = reason || 'User requested';
      await user.save();

      // Here you might want to:
      // 1. Notify related services
      // 2. Clean up user sessions
      // 3. Send confirmation email

      logger.info(`Account deactivated for user: ${user.email}, reason: ${reason || 'User requested'}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Account has been deactivated successfully')
      );

    } catch (error) {
      logger.error('Deactivate account error:', error);
      next(error);
    }
  }

  /**
   * Check if email exists (for frontend validation)
   */
  async checkEmail(req, res, next) {
    try {
      const { email } = req.body;

      if (!email) {
        throw new AppError('Email is required', 400);
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new AppError('Invalid email format', 400);
      }

      const normalizedEmail = email.toLowerCase().trim();
      const existingUser = await User.findOne({ 
        email: normalizedEmail,
        isActive: { $ne: false }
      });

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Email check completed', { 
          exists: !!existingUser,
          available: !existingUser
        })
      );

    } catch (error) {
      logger.error('Check email error:', error);
      next(error);
    }
  }

  /**
   * Calculate profile completeness percentage
   * @private
   */
  calculateProfileCompleteness(user) {
    const fields = [
      'firstName', 'lastName', 'email', 'phone', 
      'address.street', 'address.city', 'address.state',
      'profileImage', 'isEmailVerified'
    ];
    
    let completedFields = 0;
    
    fields.forEach(field => {
      const fieldParts = field.split('.');
      let value = user;
      
      for (const part of fieldParts) {
        value = value?.[part];
        if (!value) break;
      }
      
      if (value) completedFields++;
    });
    
    return Math.round((completedFields / fields.length) * 100);
  }
}

module.exports = new AuthController();