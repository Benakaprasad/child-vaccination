const User = require('../models/User');
const Child = require('../models/Child');
const VaccinationRecord = require('../models/VaccinationRecord');
const { 
  createApiResponse,
  paginateResults,
  removeEmptyFields 
} = require('../utils/helpers');
const { 
  USER_ROLES,
  RESPONSE_MESSAGES 
} = require('../utils/constants');
const { logger } = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');

class UserController {
  /**
   * Get all users (Admin only)
   */
  async getAllUsers(req, res) {
    try {
      const { 
        page = 1, 
        limit = 10, 
        sortBy = 'createdAt', 
        sortOrder = 'desc',
        role,
        isActive,
        search
      } = req.query;

      // Build filter object
      let filter = {};
      
      if (role) {
        filter.role = role;
      }
      
      if (isActive !== undefined) {
        filter.isActive = isActive === 'true';
      }
      
      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }

      const query = User.find(filter).select('-password');
      
      const result = await paginateResults(
        query,
        parseInt(page),
        parseInt(limit),
        sortBy,
        sortOrder
      );

      res.status(200).json(
        createApiResponse(
          true,
          RESPONSE_MESSAGES.SUCCESS.RETRIEVED,
          result.data,
          { pagination: result.pagination }
        )
      );

    } catch (error) {
      logger.error('Get all users error:', error);
      throw new AppError(RESPONSE_MESSAGES.ERROR.SERVER_ERROR, 500);
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(req, res) {
    try {
      const { id } = req.params;
      const requesterId = req.user._id;
      const requesterRole = req.user.role;

      // Users can view their own profile, or admins can view any profile
      if (id !== requesterId.toString() && requesterRole !== USER_ROLES.ADMIN) {
        throw new AppError(RESPONSE_MESSAGES.ERROR.FORBIDDEN, 403);
      }

      const user = await User.findById(id).select('-password');

      if (!user) {
        throw new AppError(RESPONSE_MESSAGES.ERROR.NOT_FOUND, 404);
      }

      res.status(200).json(
        createApiResponse(true, RESPONSE_MESSAGES.SUCCESS.RETRIEVED, { user })
      );

    } catch (error) {
      logger.error('Get user by ID error:', error);
      if (error instanceof AppError) throw error;
      throw new AppError(RESPONSE_MESSAGES.ERROR.SERVER_ERROR, 500);
    }
  }

  /**
   * Update user (Admin only or self-update)
   */
  async updateUser(req, res) {
    try {
      const { id } = req.params;
      const requesterId = req.user._id;
      const requesterRole = req.user.role;
      const updates = req.body;

      // Users can update their own profile, or admins can update any profile
      if (id !== requesterId.toString() && requesterRole !== USER_ROLES.ADMIN) {
        throw new AppError(RESPONSE_MESSAGES.ERROR.FORBIDDEN, 403);
      }

      // Remove sensitive fields that shouldn't be updated
      delete updates.password;
      delete updates.createdAt;
      delete updates.updatedAt;

      // Only admins can update email and role
      if (requesterRole !== USER_ROLES.ADMIN) {
        delete updates.email;
        delete updates.role;
        delete updates.isActive;
      }

      // Clean empty fields
      const cleanedUpdates = removeEmptyFields(updates);

      const user = await User.findByIdAndUpdate(
        id,
        { $set: cleanedUpdates },
        { new: true, runValidators: true }
      ).select('-password');

      if (!user) {
        throw new AppError(RESPONSE_MESSAGES.ERROR.NOT_FOUND, 404);
      }

      logger.info(`User updated: ${user.email} by ${req.user.email}`);

      res.status(200).json(
        createApiResponse(true, RESPONSE_MESSAGES.SUCCESS.UPDATED, { user })
      );

    } catch (error) {
      logger.error('Update user error:', error);
      if (error instanceof AppError) throw error;
      throw new AppError(RESPONSE_MESSAGES.ERROR.SERVER_ERROR, 500);
    }
  }

  /**
   * Delete user (Admin only)
   */
  async deleteUser(req, res) {
    try {
      const { id } = req.params;

      // Prevent admin from deleting themselves
      if (id === req.user._id.toString()) {
        throw new AppError('You cannot delete your own account', 400);
      }

      const user = await User.findById(id);
      if (!user) {
        throw new AppError(RESPONSE_MESSAGES.ERROR.NOT_FOUND, 404);
      }

      // Soft delete - deactivate instead of hard delete
      user.isActive = false;
      await user.save();

      logger.info(`User deleted: ${user.email} by ${req.user.email}`);

      res.status(200).json(
        createApiResponse(true, RESPONSE_MESSAGES.SUCCESS.DELETED)
      );

    } catch (error) {
      logger.error('Delete user error:', error);
      if (error instanceof AppError) throw error;
      throw new AppError(RESPONSE_MESSAGES.ERROR.SERVER_ERROR, 500);
    }
  }

  /**
   * Get user statistics
   */
  async getUserStatistics(req, res) {
    try {
      const stats = await User.aggregate([
        {
          $group: {
            _id: '$role',
            count: { $sum: 1 },
            active: { $sum: { $cond: ['$isActive', 1, 0] } },
            inactive: { $sum: { $cond: ['$isActive', 0, 1] } }
          }
        }
      ]);

      const totalUsers = await User.countDocuments();
      const activeUsers = await User.countDocuments({ isActive: true });
      const newUsersThisMonth = await User.countDocuments({
        createdAt: {
          $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        }
      });

      const formattedStats = {
        total: totalUsers,
        active: activeUsers,
        inactive: totalUsers - activeUsers,
        newThisMonth: newUsersThisMonth,
        byRole: stats.reduce((acc, stat) => {
          acc[stat._id] = {
            total: stat.count,
            active: stat.active,
            inactive: stat.inactive
          };
          return acc;
        }, {})
      };

      res.status(200).json(
        createApiResponse(true, RESPONSE_MESSAGES.SUCCESS.RETRIEVED, { stats: formattedStats })
      );

    } catch (error) {
      logger.error('Get user statistics error:', error);
      throw new AppError(RESPONSE_MESSAGES.ERROR.SERVER_ERROR, 500);
    }
  }

  /**
   * Get user dashboard data
   */
  async getDashboard(req, res) {
    try {
      const userId = req.user._id;

      // Get user with basic info
      const user = await User.findById(userId).select('-password');

      if (!user) {
        throw new AppError(RESPONSE_MESSAGES.ERROR.NOT_FOUND, 404);
      }

      // Get user's children
      const children = await Child.find({ parentId: userId, isActive: true });

      let dashboardData = {
        user: user,
        totalChildren: children.length
      };

      // If user is a parent, get vaccination statistics
      if (user.role === USER_ROLES.PARENT && children.length > 0) {
        const childIds = children.map(child => child._id);

        // Get vaccination statistics
        const vaccinationStats = await VaccinationRecord.aggregate([
          { $match: { childId: { $in: childIds } } },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 }
            }
          }
        ]);

        // Get upcoming vaccinations (next 30 days)
        const upcomingVaccinations = await VaccinationRecord.find({
          childId: { $in: childIds },
          status: 'scheduled',
          scheduledDate: {
            $gte: new Date(),
            $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          }
        })
        .populate('childId', 'name')
        .populate('vaccineId', 'name')
        .sort({ scheduledDate: 1 })
        .limit(5);

        // Get overdue vaccinations
        const overdueVaccinations = await VaccinationRecord.find({
          childId: { $in: childIds },
          status: 'scheduled',
          scheduledDate: { $lt: new Date() }
        })
        .populate('childId', 'name')
        .populate('vaccineId', 'name')
        .sort({ scheduledDate: 1 });

        dashboardData = {
          ...dashboardData,
          children,
          vaccinationStats: vaccinationStats.reduce((acc, stat) => {
            acc[stat._id] = stat.count;
            return acc;
          }, {}),
          upcomingVaccinations,
          overdueVaccinations,
          totalVaccinations: vaccinationStats.reduce((sum, stat) => sum + stat.count, 0)
        };
      }

      // If user is a doctor or admin, get system-wide statistics
      if (user.role === USER_ROLES.DOCTOR || user.role === USER_ROLES.ADMIN) {
        const systemStats = await this.getSystemStatistics();
        dashboardData.systemStats = systemStats;
      }

      res.status(200).json(
        createApiResponse(true, RESPONSE_MESSAGES.SUCCESS.RETRIEVED, dashboardData)
      );

    } catch (error) {
      logger.error('Get dashboard error:', error);
      if (error instanceof AppError) throw error;
      throw new AppError(RESPONSE_MESSAGES.ERROR.SERVER_ERROR, 500);
    }
  }

  /**
   * Update user preferences
   */
  async updatePreferences(req, res) {
    try {
      const userId = req.user._id;
      const { notificationPreferences } = req.body;

      const user = await User.findByIdAndUpdate(
        userId,
        { $set: { notificationPreferences } },
        { new: true, runValidators: true }
      ).select('-password');

      if (!user) {
        throw new AppError(RESPONSE_MESSAGES.ERROR.NOT_FOUND, 404);
      }

      logger.info(`Preferences updated for user: ${user.email}`);

      res.status(200).json(
        createApiResponse(true, RESPONSE_MESSAGES.SUCCESS.UPDATED, { 
          notificationPreferences: user.notificationPreferences 
        })
      );

    } catch (error) {
      logger.error('Update preferences error:', error);
      if (error instanceof AppError) throw error;
      throw new AppError(RESPONSE_MESSAGES.ERROR.SERVER_ERROR, 500);
    }
  }

  /**
   * Get system statistics (for doctors and admins)
   * @private
   */
  async getSystemStatistics() {
    try {
      const [
        totalUsers,
        totalChildren,
        totalVaccinations,
        overdueVaccinations,
        upcomingVaccinations
      ] = await Promise.all([
        User.countDocuments({ isActive: true }),
        Child.countDocuments({ isActive: true }),
        VaccinationRecord.countDocuments(),
        VaccinationRecord.countDocuments({
          status: 'scheduled',
          scheduledDate: { $lt: new Date() }
        }),
        VaccinationRecord.countDocuments({
          status: 'scheduled',
          scheduledDate: {
            $gte: new Date(),
            $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Next 7 days
          }
        })
      ]);

      return {
        totalUsers,
        totalChildren,
        totalVaccinations,
        overdueVaccinations,
        upcomingVaccinations
      };

    } catch (error) {
      logger.error('Get system statistics error:', error);
      return {};
    }
  }

  /**
   * Search users
   */
  async searchUsers(req, res) {
    try {
      const { 
        q, 
        role, 
        limit = 10 
      } = req.query;

      if (!q || q.trim().length < 2) {
        throw new AppError('Search query must be at least 2 characters long', 400);
      }

      let filter = {
        isActive: true,
        $or: [
          { name: { $regex: q, $options: 'i' } },
          { email: { $regex: q, $options: 'i' } }
        ]
      };

      if (role) {
        filter.role = role;
      }

      const users = await User.find(filter)
        .select('name email role profileImage')
        .limit(parseInt(limit))
        .sort({ name: 1 });

      res.status(200).json(
        createApiResponse(true, RESPONSE_MESSAGES.SUCCESS.RETRIEVED, { 
          users, 
          total: users.length 
        })
      );

    } catch (error) {
      logger.error('Search users error:', error);
      if (error instanceof AppError) throw error;
      throw new AppError(RESPONSE_MESSAGES.ERROR.SERVER_ERROR, 500);
    }
  }

  /**
   * Upload user profile image
   */
  async uploadProfileImage(req, res) {
    try {
      const userId = req.user._id;
      const { id } = req.params;

      // Users can update their own profile image, or admins can update any profile image
      if (id !== userId.toString() && req.user.role !== USER_ROLES.ADMIN) {
        throw new AppError(RESPONSE_MESSAGES.ERROR.FORBIDDEN, 403);
      }

      if (!req.file) {
        throw new AppError('No image file provided', 400);
      }

      const user = await User.findByIdAndUpdate(
        id,
        { profileImage: req.file.filename },
        { new: true }
      ).select('-password');

      if (!user) {
        throw new AppError(RESPONSE_MESSAGES.ERROR.NOT_FOUND, 404);
      }

      logger.info(`Profile image updated for user: ${user.email}`);

      res.status(200).json(
        createApiResponse(true, RESPONSE_MESSAGES.SUCCESS.UPDATED, { 
          profileImage: user.profileImage 
        })
      );

    } catch (error) {
      logger.error('Upload profile image error:', error);
      if (error instanceof AppError) throw error;
      throw new AppError(RESPONSE_MESSAGES.ERROR.SERVER_ERROR, 500);
    }
  }

  /**
   * Get user activity log (Admin only)
   */
  async getUserActivity(req, res) {
    try {
      const { id } = req.params;
      const { 
        page = 1, 
        limit = 20, 
        startDate, 
        endDate 
      } = req.query;

      const user = await User.findById(id);
      if (!user) {
        throw new AppError(RESPONSE_MESSAGES.ERROR.NOT_FOUND, 404);
      }

      // This would require implementing an activity logging system
      // For now, return basic user information
      const activity = {
        userId: user._id,
        email: user.email,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        isActive: user.isActive
      };

      res.status(200).json(
        createApiResponse(true, RESPONSE_MESSAGES.SUCCESS.RETRIEVED, { activity })
      );

    } catch (error) {
      logger.error('Get user activity error:', error);
      if (error instanceof AppError) throw error;
      throw new AppError(RESPONSE_MESSAGES.ERROR.SERVER_ERROR, 500);
    }
  }

  /**
   * Export users data (Admin only)
   */
  async exportUsers(req, res) {
    try {
      const { format = 'json', role, isActive } = req.query;

      let filter = {};
      if (role) filter.role = role;
      if (isActive !== undefined) filter.isActive = isActive === 'true';

      const users = await User.find(filter)
        .select('-password')
        .sort({ createdAt: -1 });

      if (format === 'csv') {
        // Convert to CSV format
        const csv = this.convertToCSV(users);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
        return res.send(csv);
      }

      res.status(200).json(
        createApiResponse(true, RESPONSE_MESSAGES.SUCCESS.RETRIEVED, { 
          users, 
          total: users.length,
          exportedAt: new Date()
        })
      );

    } catch (error) {
      logger.error('Export users error:', error);
      if (error instanceof AppError) throw error;
      throw new AppError(RESPONSE_MESSAGES.ERROR.SERVER_ERROR, 500);
    }
  }

  /**
   * Convert users array to CSV format
   * @private
   */
  convertToCSV(users) {
    const headers = [
      'ID', 'Name', 'Email', 'Phone', 'Role', 
      'Is Active', 'Created At', 'Last Login'
    ];

    const rows = users.map(user => [
      user._id,
      user.name,
      user.email,
      user.phone || '',
      user.role,
      user.isActive,
      user.createdAt.toISOString(),
      user.lastLogin ? user.lastLogin.toISOString() : 'Never'
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');

    return csvContent;
  }

  /**
   * Activate/Deactivate user (Admin only)
   */
  async toggleUserStatus(req, res) {
    try {
      const { id } = req.params;
      const { isActive } = req.body;

      // Prevent admin from deactivating themselves
      if (id === req.user._id.toString() && !isActive) {
        throw new AppError('You cannot deactivate your own account', 400);
      }

      const user = await User.findByIdAndUpdate(
        id,
        { isActive },
        { new: true }
      ).select('-password');

      if (!user) {
        throw new AppError(RESPONSE_MESSAGES.ERROR.NOT_FOUND, 404);
      }

      const action = isActive ? 'activated' : 'deactivated';
      logger.info(`User ${action}: ${user.email} by ${req.user.email}`);

      res.status(200).json(
        createApiResponse(true, `User ${action} successfully`, { 
          user: {
            id: user._id,
            email: user.email,
            isActive: user.isActive
          }
        })
      );

    } catch (error) {
      logger.error('Toggle user status error:', error);
      if (error instanceof AppError) throw error;
      throw new AppError(RESPONSE_MESSAGES.ERROR.SERVER_ERROR, 500);
    }
  }

  /**
   * Get users by role
   */
  async getUsersByRole(req, res) {
    try {
      const { role } = req.params;
      const { 
        page = 1, 
        limit = 10, 
        isActive = true 
      } = req.query;

      if (!Object.values(USER_ROLES).includes(role)) {
        throw new AppError('Invalid role specified', 400);
      }

      const filter = { role, isActive: isActive === 'true' };
      const query = User.find(filter).select('-password');
      
      const result = await paginateResults(
        query,
        parseInt(page),
        parseInt(limit),
        'name',
        'asc'
      );

      res.status(200).json(
        createApiResponse(
          true,
          `${role} users retrieved successfully`,
          result.data,
          { pagination: result.pagination }
        )
      );

    } catch (error) {
      logger.error('Get users by role error:', error);
      if (error instanceof AppError) throw error;
      throw new AppError(RESPONSE_MESSAGES.ERROR.SERVER_ERROR, 500);
    }
  }
}

module.exports = new UserController();