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
  SUCCESS_MESSAGES 
} = require('../utils/constants');
const emailService = require('../services/emailService');
const logger = require('../utils/logger');
const crypto = require('crypto');

class AuthController {
  /**
   * Register a new user
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async register(req, res) {
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

      // Check if user already exists
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return res.status(HTTP_STATUS.CONFLICT).json(
          createApiResponse(false, ERROR_MESSAGES.USER_ALREADY_EXISTS)
        );
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

      // Create new user
      const user = new User({
        firstName,
        lastName,
        email: email.toLowerCase(),
        password: hashedPassword,
        phone,
        role,
        address,
        preferences
      });

      await user.save();

      // Generate JWT token
      const token = generateToken({ 
        userId: user._id, 
        email: user.email, 
        role: user.role 
      });

      // Remove password from response
      const userResponse = user.toObject();
      delete userResponse.password;

      // Send welcome email
      try {
        await emailService.sendWelcomeEmail(user);
      } catch (emailError) {
        logger.error('Failed to send welcome email:', emailError);
        // Don't fail registration if email fails
      }

      logger.info(`New user registered: ${user.email}`);

      res.status(HTTP_STATUS.CREATED).json(
        createApiResponse(
          true, 
          SUCCESS_MESSAGES.USER_REGISTERED,
          {
            user: userResponse,
            token
          }
        )
      );

    } catch (error) {
      logger.error('Registration error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Login user
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async login(req, res) {
    try {
      const { email, password } = req.body;

      // Find user by email
      const user = await User.findOne({ 
        email: email.toLowerCase(),
        isActive: true
      });

      if (!user) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json(
          createApiResponse(false, ERROR_MESSAGES.INVALID_CREDENTIALS)
        );
      }

      // Verify password
      const isValidPassword = await comparePassword(password, user.password);
      if (!isValidPassword) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json(
          createApiResponse(false, ERROR_MESSAGES.INVALID_CREDENTIALS)
        );
      }

      // Update last login
      await user.updateLastLogin();

      // Generate JWT token
      const token = generateToken({ 
        userId: user._id, 
        email: user.email, 
        role: user.role 
      });

      // Remove password from response
      const userResponse = user.toObject();
      delete userResponse.password;

      logger.info(`User logged in: ${user.email}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(
          true, 
          SUCCESS_MESSAGES.LOGIN_SUCCESS,
          {
            user: userResponse,
            token
          }
        )
      );

    } catch (error) {
      logger.error('Login error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Get current user profile
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getProfile(req, res) {
    try {
      const user = await User.findById(req.user.userId)
        .populate('children', 'firstName lastName dateOfBirth gender')
        .select('-password');

      if (!user) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, ERROR_MESSAGES.USER_NOT_FOUND)
        );
      }

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Profile retrieved successfully', { user })
      );

    } catch (error) {
      logger.error('Get profile error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Update user profile
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async updateProfile(req, res) {
    try {
      const userId = req.user.userId;
      const updates = req.body;

      // Remove fields that shouldn't be updated via this endpoint
      delete updates.email;
      delete updates.password;
      delete updates.role;
      delete updates.children;

      const user = await User.findByIdAndUpdate(
        userId,
        { $set: updates },
        { new: true, runValidators: true }
      ).select('-password');

      if (!user) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, ERROR_MESSAGES.USER_NOT_FOUND)
        );
      }

      logger.info(`User profile updated: ${user.email}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, SUCCESS_MESSAGES.PROFILE_UPDATED, { user })
      );

    } catch (error) {
      logger.error('Update profile error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Change user password
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user.userId;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, ERROR_MESSAGES.USER_NOT_FOUND)
        );
      }

      // Verify current password
      const isValidPassword = await comparePassword(currentPassword, user.password);
      if (!isValidPassword) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json(
          createApiResponse(false, 'Current password is incorrect')
        );
      }

      // Hash new password
      const hashedNewPassword = await hashPassword(newPassword);
      
      // Update password
      user.password = hashedNewPassword;
      await user.save();

      logger.info(`Password changed for user: ${user.email}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Password changed successfully')
      );

    } catch (error) {
      logger.error('Change password error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Request password reset
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async forgotPassword(req, res) {
    try {
      const { email } = req.body;

      const user = await User.findOne({ 
        email: email.toLowerCase(),
        isActive: true
      });

      if (!user) {
        // Don't reveal if email exists for security
        return res.status(HTTP_STATUS.OK).json(
          createApiResponse(
            true, 
            'If an account with that email exists, a password reset link has been sent'
          )
        );
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Save reset token to user
      user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
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
        
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
          createApiResponse(false, 'Failed to send password reset email')
        );
      }

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(
          true, 
          'Password reset link has been sent to your email'
        )
      );

    } catch (error) {
      logger.error('Forgot password error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Reset password with token
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async resetPassword(req, res) {
    try {
      const { token, newPassword } = req.body;

      // Hash token
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

      // Find user with valid reset token
      const user = await User.findOne({
        resetPasswordToken: hashedToken,
        resetPasswordExpires: { $gt: Date.now() },
        isActive: true
      });

      if (!user) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json(
          createApiResponse(false, 'Invalid or expired reset token')
        );
      }

      // Hash new password
      const hashedNewPassword = await hashPassword(newPassword);

      // Update password and clear reset token
      user.password = hashedNewPassword;
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();

      logger.info(`Password reset completed for user: ${user.email}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Password has been reset successfully')
      );

    } catch (error) {
      logger.error('Reset password error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Logout user (client-side token removal)
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async logout(req, res) {
    try {
      // In a stateless JWT system, logout is handled client-side
      // We just acknowledge the request
      logger.info(`User logged out: ${req.user.email}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, SUCCESS_MESSAGES.LOGOUT_SUCCESS)
      );

    } catch (error) {
      logger.error('Logout error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Verify email address
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async verifyEmail(req, res) {
    try {
      const { token } = req.params;

      // Hash token
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

      const user = await User.findOne({
        emailVerificationToken: hashedToken,
        emailVerificationExpires: { $gt: Date.now() }
      });

      if (!user) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json(
          createApiResponse(false, 'Invalid or expired verification token')
        );
      }

      // Mark email as verified
      user.isEmailVerified = true;
      user.emailVerificationToken = undefined;
      user.emailVerificationExpires = undefined;
      await user.save();

      logger.info(`Email verified for user: ${user.email}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Email verified successfully')
      );

    } catch (error) {
      logger.error('Email verification error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Refresh JWT token
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async refreshToken(req, res) {
    try {
      const userId = req.user.userId;

      const user = await User.findById(userId).select('-password');
      if (!user || !user.isActive) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json(
          createApiResponse(false, ERROR_MESSAGES.UNAUTHORIZED)
        );
      }

      // Generate new token
      const token = generateToken({ 
        userId: user._id, 
        email: user.email, 
        role: user.role 
      });

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Token refreshed successfully', { token })
      );

    } catch (error) {
      logger.error('Token refresh error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Deactivate user account
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async deactivateAccount(req, res) {
    try {
      const { password } = req.body;
      const userId = req.user.userId;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, ERROR_MESSAGES.USER_NOT_FOUND)
        );
      }

      // Verify password
      const isValidPassword = await comparePassword(password, user.password);
      if (!isValidPassword) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json(
          createApiResponse(false, 'Password is incorrect')
        );
      }

      // Deactivate account
      user.isActive = false;
      user.deactivatedAt = new Date();
      await user.save();

      logger.info(`Account deactivated for user: ${user.email}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Account has been deactivated successfully')
      );

    } catch (error) {
      logger.error('Account deactivation error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }
}

module.exports = new AuthController();