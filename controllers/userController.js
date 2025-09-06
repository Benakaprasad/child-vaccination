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
  async getAllUsers(req, res, next) {
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

      // Validate pagination parameters
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit))); // Cap at 100

      // Build filter object
      let filter = {};
      
      if (role && Object.values(USER_ROLES).includes(role)) {
        filter.role = role;
      }
      
      if (isActive !== undefined) {
        filter.isActive = isActive === 'true';
      }
      
      if (search && search.trim().length >= 2) {
        const searchRegex = { $regex: search.trim(), $options: 'i' };
        filter.$or = [
          { name: searchRegex },
          { email: searchRegex }
        ];
      }

      const query = User.find(filter).select('-password');
      
      const result = await paginateResults(
        query,
        pageNum,
        limitNum,
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
      next(error);
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(req, res, next) {
    try {
      const { id } = req.params;
      const requesterId = req.user._id;
      const requesterRole = req.user.role;

      // Validate MongoDB ObjectId format
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new AppError('Invalid user ID format', 400);
      }

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
      next(error);
    }
  }

  /**
   * Update user (Admin only or self-update)
   */
  async updateUser(req, res, next) {
    try {
      const { id } = req.params;
      const requesterId = req.user._id;
      const requesterRole = req.user.role;
      const updates = req.body;

      // Validate MongoDB ObjectId format
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new AppError('Invalid user ID format', 400);
      }

      // Users can update their own profile, or admins can update any profile
      if (id !== requesterId.toString() && requesterRole !== USER_ROLES.ADMIN) {
        throw new AppError(RESPONSE_MESSAGES.ERROR.FORBIDDEN, 403);
      }

      // Remove sensitive fields that shouldn't be updated
      const protectedFields = ['password', 'createdAt', 'updatedAt', '_id'];
      protectedFields.forEach(field => delete updates[field]);

      // Only admins can update email and role
      if (requesterRole !== USER_ROLES.ADMIN) {
        const adminOnlyFields = ['email', 'role', 'isActive'];
        adminOnlyFields.forEach(field => delete updates[field]);
      }

      // Validate role if being updated
      if (updates.role && !Object.values(USER_ROLES).includes(updates.role)) {
        throw new AppError('Invalid role specified', 400);
      }

      // Clean empty fields
      const cleanedUpdates = removeEmptyFields(updates);

      if (Object.keys(cleanedUpdates).length === 0) {
        throw new AppError('No valid fields to update', 400);
      }

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
      next(error);
    }
  }

  /**
   * Delete user (Admin only)
   */
  async deleteUser(req, res, next) {
    try {
      const { id } = req.params;

      // Validate MongoDB ObjectId format
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new AppError('Invalid user ID format', 400);
      }

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
      user.deletedAt = new Date();
      user.deletedBy = req.user._id;
      await user.save();

      logger.info(`User deleted: ${user.email} by ${req.user.email}`);

      res.status(200).json(
        createApiResponse(true, RESPONSE_MESSAGES.SUCCESS.DELETED)
      );

    } catch (error) {
      logger.error('Delete user error:', error);
      next(error);
    }
  }

  /**
   * Get user statistics
   */
  async getUserStatistics(req, res, next) {
    try {
      const [stats, totalUsers, activeUsers, newUsersThisMonth] = await Promise.all([
        User.aggregate([
          {
            $group: {
              _id: '$role',
              count: { $sum: 1 },
              active: { $sum: { $cond: ['$isActive', 1, 0] } },
              inactive: { $sum: { $cond: ['$isActive', 0, 1] } }
            }
          }
        ]),
        User.countDocuments(),
        User.countDocuments({ isActive: true }),
        User.countDocuments({
          createdAt: {
            $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
          }
        })
      ]);

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
      next(error);
    }
  }

  /**
   * Get user dashboard data
   */
  async getDashboard(req, res, next) {
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
        const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        const upcomingVaccinations = await VaccinationRecord.find({
          childId: { $in: childIds },
          status: 'scheduled',
          scheduledDate: {
            $gte: new Date(),
            $lte: thirtyDaysFromNow
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
      next(error);
    }
  }

  /**
   * Update user preferences
   */
  async updatePreferences(req, res, next) {
    try {
      const userId = req.user._id;
      const { notificationPreferences } = req.body;

      if (!notificationPreferences || typeof notificationPreferences !== 'object') {
        throw new AppError('Valid notification preferences are required', 400);
      }

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
      next(error);
    }
  }

  /**
   * Get system statistics (for doctors and admins)
   * @private
   */
  async getSystemStatistics() {
    try {
      const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      
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
            $lte: sevenDaysFromNow
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
  async searchUsers(req, res, next) {
    try {
      const { q, role, limit = 10 } = req.query;

      if (!q || q.trim().length < 2) {
        throw new AppError('Search query must be at least 2 characters long', 400);
      }

      const searchTerm = q.trim();
      const searchLimit = Math.min(50, Math.max(1, parseInt(limit))); // Cap at 50

      let filter = {
        isActive: true,
        $or: [
          { name: { $regex: searchTerm, $options: 'i' } },
          { email: { $regex: searchTerm, $options: 'i' } }
        ]
      };

      if (role && Object.values(USER_ROLES).includes(role)) {
        filter.role = role;
      }

      const users = await User.find(filter)
        .select('name email role profileImage')
        .limit(searchLimit)
        .sort({ name: 1 });

      res.status(200).json(
        createApiResponse(true, RESPONSE_MESSAGES.SUCCESS.RETRIEVED, { 
          users, 
          total: users.length 
        })
      );

    } catch (error) {
      logger.error('Search users error:', error);
      next(error);
    }
  }

  /**
   * Upload user profile image
   */
  async uploadProfileImage(req, res, next) {
    try {
      const userId = req.user._id;
      const { id } = req.params;

      // Validate MongoDB ObjectId format
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new AppError('Invalid user ID format', 400);
      }

      // Users can update their own profile image, or admins can update any profile image
      if (id !== userId.toString() && req.user.role !== USER_ROLES.ADMIN) {
        throw new AppError(RESPONSE_MESSAGES.ERROR.FORBIDDEN, 403);
      }

      if (!req.file) {
        throw new AppError('No image file provided', 400);
      }

      // Validate file type (assuming multer middleware handles this, but double-check)
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(req.file.mimetype)) {
        throw new AppError('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed', 400);
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
      next(error);
    }
  }

  /**
   * Get user activity log (Admin only)
   */
  async getUserActivity(req, res, next) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 20, startDate, endDate } = req.query;

      // Validate MongoDB ObjectId format
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new AppError('Invalid user ID format', 400);
      }

      const user = await User.findById(id);
      if (!user) {
        throw new AppError(RESPONSE_MESSAGES.ERROR.NOT_FOUND, 404);
      }

      // Build date filter if provided
      let dateFilter = {};
      if (startDate) {
        dateFilter.$gte = new Date(startDate);
      }
      if (endDate) {
        dateFilter.$lte = new Date(endDate);
      }

      // This would require implementing an activity logging system
      // For now, return basic user information with enhanced data
      const activity = {
        userId: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        isActive: user.isActive,
        loginCount: user.loginCount || 0, // Assuming this field exists
        // Add more activity fields as needed
        dateRange: {
          startDate: startDate || user.createdAt,
          endDate: endDate || new Date()
        }
      };

      res.status(200).json(
        createApiResponse(true, RESPONSE_MESSAGES.SUCCESS.RETRIEVED, { activity })
      );

    } catch (error) {
      logger.error('Get user activity error:', error);
      next(error);
    }
  }

  /**
   * Export users data (Admin only)
   */
  async exportUsers(req, res, next) {
    try {
      const { format = 'json', role, isActive } = req.query;

      let filter = {};
      if (role && Object.values(USER_ROLES).includes(role)) {
        filter.role = role;
      }
      if (isActive !== undefined) {
        filter.isActive = isActive === 'true';
      }

      const users = await User.find(filter)
        .select('-password')
        .sort({ createdAt: -1 })
        .lean(); // Use lean() for better performance on large datasets

      if (format === 'csv') {
        const csv = this.convertToCSV(users);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
        return res.send(csv);
      }

      res.status(200).json(
        createApiResponse(true, RESPONSE_MESSAGES.SUCCESS.RETRIEVED, { 
          users, 
          total: users.length,
          exportedAt: new Date(),
          filters: { role, isActive }
        })
      );

    } catch (error) {
      logger.error('Export users error:', error);
      next(error);
    }
  }

  /**
   * Convert users array to CSV format
   * @private
   */
  convertToCSV(users) {
    if (users.length === 0) {
      return 'No data available';
    }

    const headers = [
      'ID', 'Name', 'Email', 'Phone', 'Role', 
      'Is Active', 'Created At', 'Last Login'
    ];

    const rows = users.map(user => [
      user._id,
      user.name || '',
      user.email || '',
      user.phone || '',
      user.role || '',
      user.isActive ? 'Yes' : 'No',
      user.createdAt ? new Date(user.createdAt).toISOString() : '',
      user.lastLogin ? new Date(user.lastLogin).toISOString() : 'Never'
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    return csvContent;
  }

  /**
   * Activate/Deactivate user (Admin only)
   */
  async toggleUserStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { isActive } = req.body;

      // Validate MongoDB ObjectId format
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new AppError('Invalid user ID format', 400);
      }

      // Validate isActive parameter
      if (typeof isActive !== 'boolean') {
        throw new AppError('isActive must be a boolean value', 400);
      }

      // Prevent admin from deactivating themselves
      if (id === req.user._id.toString() && !isActive) {
        throw new AppError('You cannot deactivate your own account', 400);
      }

      const user = await User.findByIdAndUpdate(
        id,
        { 
          isActive,
          ...(isActive ? {} : { deactivatedAt: new Date(), deactivatedBy: req.user._id })
        },
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
            name: user.name,
            isActive: user.isActive
          }
        })
      );

    } catch (error) {
      logger.error('Toggle user status error:', error);
      next(error);
    }
  }

  /**
   * Get users by role
   */
  async getUsersByRole(req, res, next) {
    try {
      const { role } = req.params;
      const { page = 1, limit = 10, isActive = true } = req.query;

      if (!Object.values(USER_ROLES).includes(role)) {
        throw new AppError('Invalid role specified', 400);
      }

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

      const filter = { role, isActive: isActive === 'true' };
      const query = User.find(filter).select('-password');
      
      const result = await paginateResults(
        query,
        pageNum,
        limitNum,
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
      next(error);
    }
  }

  /**
   * Bulk update users (Admin only)
   */
  async bulkUpdateUsers(req, res, next) {
    try {
      const { userIds, updates } = req.body;

      if (!Array.isArray(userIds) || userIds.length === 0) {
        throw new AppError('User IDs array is required', 400);
      }

      if (!updates || typeof updates !== 'object') {
        throw new AppError('Updates object is required', 400);
      }

      // Validate all user IDs
      const invalidIds = userIds.filter(id => !id.match(/^[0-9a-fA-F]{24}$/));
      if (invalidIds.length > 0) {
        throw new AppError('Invalid user ID format detected', 400);
      }

      // Remove sensitive fields
      const protectedFields = ['password', 'createdAt', 'updatedAt', '_id', 'email'];
      protectedFields.forEach(field => delete updates[field]);

      // Prevent updating self to inactive
      if (updates.isActive === false && userIds.includes(req.user._id.toString())) {
        throw new AppError('Cannot deactivate your own account in bulk update', 400);
      }

      const result = await User.updateMany(
        { _id: { $in: userIds } },
        { $set: updates },
        { runValidators: true }
      );

      logger.info(`Bulk update performed on ${result.modifiedCount} users by ${req.user.email}`);

      res.status(200).json(
        createApiResponse(true, 'Bulk update completed successfully', {
          matchedCount: result.matchedCount,
          modifiedCount: result.modifiedCount,
          updates
        })
      );

    } catch (error) {
      logger.error('Bulk update users error:', error);
      next(error);
    }
  }
}

module.exports = new UserController();