const Child = require('../models/Child');
const User = require('../models/User');
const VaccinationRecord = require('../models/VaccinationRecord');
const vaccinationScheduler = require('../services/vaccinationScheduler');
const { 
  createApiResponse,
  paginateResults,
  calculateAge,
  calculateVaccinationProgress,
  removeEmptyFields 
} = require('../utils/helpers');
const { 
  HTTP_STATUS, 
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  USER_ROLES 
} = require('../utils/constants');
const { logger } = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');

class ChildController {
  /**
   * Get children based on user role and permissions
   */
  async getChildren(req, res, next) {
    try {
      const userId = req.user._id || req.user.userId;
      const userRole = req.user.role;
      const { 
        page = 1, 
        limit = 10, 
        parentId, 
        sortBy = 'firstName', 
        sortOrder = 'asc' 
      } = req.query;

      // Validate pagination parameters
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(50, Math.max(1, parseInt(limit)));

      let filter = { isActive: true };
      
      // Parents can only see their own children
      if (userRole === USER_ROLES.PARENT) {
        filter.parent = userId;
      }
      // Doctors and admins can see all children (with optional filters)
      else if (userRole === USER_ROLES.DOCTOR || userRole === USER_ROLES.ADMIN) {
        if (parentId) {
          // Validate parentId format
          if (!parentId.match(/^[0-9a-fA-F]{24}$/)) {
            throw new AppError('Invalid parent ID format', 400);
          }
          filter.parent = parentId;
        }
      }

      const query = Child.find(filter)
        .populate('parent', 'name email phone')
        .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 });

      const result = await paginateResults(
        query,
        pageNum,
        limitNum,
        sortBy,
        sortOrder
      );

      // Add calculated fields
      const childrenWithStats = result.data.map(child => {
        const childObj = child.toObject();
        childObj.age = calculateAge(child.dateOfBirth);
        childObj.ageInMonths = calculateAge(child.dateOfBirth, 'months');
        return childObj;
      });

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(
          true, 
          'Children retrieved successfully', 
          childrenWithStats,
          { pagination: result.pagination }
        )
      );

    } catch (error) {
      logger.error('Get children error:', error);
      next(error);
    }
  }

  /**
   * Get a specific child by ID with vaccination records
   */
  async getChildById(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user._id || req.user.userId;
      const userRole = req.user.role;

      // Validate MongoDB ObjectId format
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new AppError('Invalid child ID format', 400);
      }

      const child = await Child.findById(id)
        .populate('parent', 'name email phone');

      if (!child) {
        throw new AppError(ERROR_MESSAGES.CHILD_NOT_FOUND || 'Child not found', 404);
      }

      // Check permissions: parents can only access their own children
      if (userRole === USER_ROLES.PARENT && child.parent._id.toString() !== userId.toString()) {
        throw new AppError(ERROR_MESSAGES.CHILD_NOT_OWNED || 'Access denied to this child', 403);
      }

      // Get vaccination records for this child
      const vaccinationRecords = await VaccinationRecord.find({ child: id })
        .populate('vaccine', 'name type manufacturer')
        .sort({ scheduledDate: 1 });

      // Calculate vaccination progress
      const vaccinationProgress = calculateVaccinationProgress(vaccinationRecords);

      const childData = {
        ...child.toObject(),
        age: calculateAge(child.dateOfBirth),
        ageInMonths: calculateAge(child.dateOfBirth, 'months'),
        ageInDays: calculateAge(child.dateOfBirth, 'days'),
        vaccinationRecords,
        vaccinationProgress
      };

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Child retrieved successfully', { child: childData })
      );

    } catch (error) {
      logger.error('Get child by ID error:', error);
      next(error);
    }
  }

  /**
   * Create a new child profile
   */
  async createChild(req, res, next) {
    try {
      const userId = req.user._id || req.user.userId;
      const userRole = req.user.role;
      const childData = req.body;

      // Validate required fields
      const requiredFields = ['firstName', 'lastName', 'dateOfBirth', 'gender'];
      const missingFields = requiredFields.filter(field => !childData[field]);
      
      if (missingFields.length > 0) {
        throw new AppError(`Missing required fields: ${missingFields.join(', ')}`, 400);
      }

      // Validate date of birth
      const birthDate = new Date(childData.dateOfBirth);
      if (isNaN(birthDate.getTime()) || birthDate > new Date()) {
        throw new AppError('Invalid date of birth', 400);
      }

      // Validate gender
      if (!['male', 'female', 'other'].includes(childData.gender)) {
        throw new AppError('Invalid gender value', 400);
      }

      // Determine parent ID
      let parentId = userId; // Default to current user for parents
      
      // Doctors and admins can specify different parent
      if ((userRole === USER_ROLES.DOCTOR || userRole === USER_ROLES.ADMIN) && childData.parent) {
        if (!childData.parent.match(/^[0-9a-fA-F]{24}$/)) {
          throw new AppError('Invalid parent ID format', 400);
        }
        parentId = childData.parent;
      }

      // Verify parent exists and has PARENT role
      const parent = await User.findById(parentId);
      if (!parent) {
        throw new AppError('Parent user not found', 404);
      }

      if (parent.role !== USER_ROLES.PARENT) {
        throw new AppError('Specified user is not a parent', 400);
      }

      // Create child
      const child = new Child({
        ...childData,
        parent: parentId,
        dateOfBirth: birthDate
      });

      await child.save();

      // Add child to parent's children array if it exists
      if (parent.children) {
        await User.findByIdAndUpdate(
          parentId,
          { $addToSet: { children: child._id } }
        );
      }

      // Generate vaccination schedule for the new child
      try {
        await vaccinationScheduler.generateScheduleForChild(child._id);
        logger.info(`Vaccination schedule generated for new child: ${child._id}`);
      } catch (scheduleError) {
        logger.error('Failed to generate vaccination schedule:', scheduleError);
        // Don't fail child creation if schedule generation fails
      }

      // Populate parent information
      await child.populate('parent', 'name email');

      const childResponse = {
        ...child.toObject(),
        age: calculateAge(child.dateOfBirth),
        ageInMonths: calculateAge(child.dateOfBirth, 'months')
      };

      logger.info(`New child created: ${child.firstName} ${child.lastName} for parent ${parent.email}`);

      res.status(HTTP_STATUS.CREATED).json(
        createApiResponse(true, SUCCESS_MESSAGES.CHILD_ADDED || 'Child added successfully', { child: childResponse })
      );

    } catch (error) {
      logger.error('Create child error:', error);
      next(error);
    }
  }

  /**
   * Update child information
   */
  async updateChild(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user._id || req.user.userId;
      const userRole = req.user.role;
      const updates = req.body;

      // Validate MongoDB ObjectId format
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new AppError('Invalid child ID format', 400);
      }

      const child = await Child.findById(id);
      if (!child) {
        throw new AppError(ERROR_MESSAGES.CHILD_NOT_FOUND || 'Child not found', 404);
      }

      // Check permissions
      if (userRole === USER_ROLES.PARENT && child.parent.toString() !== userId.toString()) {
        throw new AppError(ERROR_MESSAGES.CHILD_NOT_OWNED || 'Access denied to this child', 403);
      }

      // Remove fields that shouldn't be updated
      const protectedFields = ['parent', 'createdAt', 'updatedAt', '_id'];
      protectedFields.forEach(field => delete updates[field]);

      // Validate specific fields if they're being updated
      if (updates.dateOfBirth) {
        const birthDate = new Date(updates.dateOfBirth);
        if (isNaN(birthDate.getTime()) || birthDate > new Date()) {
          throw new AppError('Invalid date of birth', 400);
        }
        updates.dateOfBirth = birthDate;
      }

      if (updates.gender && !['male', 'female', 'other'].includes(updates.gender)) {
        throw new AppError('Invalid gender value', 400);
      }

      // Clean empty fields
      const cleanedUpdates = removeEmptyFields(updates);

      if (Object.keys(cleanedUpdates).length === 0) {
        throw new AppError('No valid fields to update', 400);
      }

      const updatedChild = await Child.findByIdAndUpdate(
        id,
        { $set: cleanedUpdates },
        { new: true, runValidators: true }
      ).populate('parent', 'name email');

      const childResponse = {
        ...updatedChild.toObject(),
        age: calculateAge(updatedChild.dateOfBirth),
        ageInMonths: calculateAge(updatedChild.dateOfBirth, 'months')
      };

      logger.info(`Child updated: ${updatedChild.firstName} ${updatedChild.lastName}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, SUCCESS_MESSAGES.CHILD_UPDATED || 'Child updated successfully', { child: childResponse })
      );

    } catch (error) {
      logger.error('Update child error:', error);
      next(error);
    }
  }

  /**
   * Delete child and associated records (soft delete recommended)
   */
  async deleteChild(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user._id || req.user.userId;
      const userRole = req.user.role;

      // Validate MongoDB ObjectId format
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new AppError('Invalid child ID format', 400);
      }

      const child = await Child.findById(id);
      if (!child) {
        throw new AppError(ERROR_MESSAGES.CHILD_NOT_FOUND || 'Child not found', 404);
      }

      // Check permissions
      if (userRole === USER_ROLES.PARENT && child.parent.toString() !== userId.toString()) {
        throw new AppError(ERROR_MESSAGES.CHILD_NOT_OWNED || 'Access denied to this child', 403);
      }

      // Soft delete: mark as inactive instead of hard delete
      child.isActive = false;
      child.deletedAt = new Date();
      child.deletedBy = userId;
      await child.save();

      // Remove child from parent's children array
      await User.findByIdAndUpdate(
        child.parent,
        { $pull: { children: child._id } }
      );

      // Mark associated vaccination records as inactive instead of deleting
      await VaccinationRecord.updateMany(
        { child: id },
        { isActive: false, deletedAt: new Date(), deletedBy: userId }
      );

      logger.info(`Child soft deleted: ${child.firstName} ${child.lastName} by ${req.user.email || userId}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, SUCCESS_MESSAGES.CHILD_DELETED || 'Child deleted successfully')
      );

    } catch (error) {
      logger.error('Delete child error:', error);
      next(error);
    }
  }

  /**
   * Get vaccination schedule for a specific child
   */
  async getVaccinationSchedule(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user._id || req.user.userId;
      const userRole = req.user.role;

      // Validate MongoDB ObjectId format
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new AppError('Invalid child ID format', 400);
      }

      const child = await Child.findById(id);
      if (!child) {
        throw new AppError(ERROR_MESSAGES.CHILD_NOT_FOUND || 'Child not found', 404);
      }

      // Check permissions
      if (userRole === USER_ROLES.PARENT && child.parent.toString() !== userId.toString()) {
        throw new AppError(ERROR_MESSAGES.CHILD_NOT_OWNED || 'Access denied to this child', 403);
      }

      const vaccinationRecords = await VaccinationRecord.find({ 
        child: id, 
        isActive: { $ne: false } 
      })
        .populate('vaccine', 'name type manufacturer schedule sideEffects')
        .sort({ scheduledDate: 1 });

      // Group by status
      const scheduleByStatus = {
        scheduled: [],
        completed: [],
        missed: [],
        cancelled: [],
        overdue: []
      };

      const now = new Date();
      vaccinationRecords.forEach(record => {
        let status = record.status;
        
        // Auto-mark as overdue if scheduled date has passed and still scheduled
        if (status === 'scheduled' && record.scheduledDate < now) {
          status = 'overdue';
        }
        
        scheduleByStatus[status].push(record);
      });

      // Calculate progress
      const totalVaccinations = vaccinationRecords.length;
      const completedVaccinations = scheduleByStatus.completed.length;
      const progress = totalVaccinations > 0 ? 
        Math.round((completedVaccinations / totalVaccinations) * 100) : 0;

      const scheduleData = {
        childId: id,
        childName: `${child.firstName} ${child.lastName}`,
        childAge: {
          years: calculateAge(child.dateOfBirth),
          months: calculateAge(child.dateOfBirth, 'months')
        },
        totalVaccinations,
        completedVaccinations,
        progress,
        scheduleByStatus,
        allRecords: vaccinationRecords
      };

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Vaccination schedule retrieved successfully', scheduleData)
      );

    } catch (error) {
      logger.error('Get vaccination schedule error:', error);
      next(error);
    }
  }

  /**
   * Generate or regenerate vaccination schedule for a child
   */
  async generateVaccinationSchedule(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user._id || req.user.userId;
      const userRole = req.user.role;
      const { regenerate = false } = req.body;

      // Validate MongoDB ObjectId format
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new AppError('Invalid child ID format', 400);
      }

      const child = await Child.findById(id);
      if (!child) {
        throw new AppError(ERROR_MESSAGES.CHILD_NOT_FOUND || 'Child not found', 404);
      }

      // Check permissions - only doctors/admins or child's parent can generate schedule
      if (userRole === USER_ROLES.PARENT && child.parent.toString() !== userId.toString()) {
        throw new AppError(ERROR_MESSAGES.CHILD_NOT_OWNED || 'Access denied to this child', 403);
      }

      // Check if schedule already exists and regenerate flag is false
      if (!regenerate) {
        const existingRecords = await VaccinationRecord.countDocuments({ child: id });
        if (existingRecords > 0) {
          throw new AppError('Vaccination schedule already exists. Use regenerate option to overwrite.', 400);
        }
      }

      // Generate vaccination schedule
      const scheduleResult = await vaccinationScheduler.generateScheduleForChild(id, regenerate);

      logger.info(`Vaccination schedule ${regenerate ? 'regenerated' : 'generated'} for child: ${child.firstName} ${child.lastName}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(
          true, 
          `Vaccination schedule ${regenerate ? 'regenerated' : 'generated'} successfully`, 
          scheduleResult
        )
      );

    } catch (error) {
      logger.error('Generate vaccination schedule error:', error);
      next(error);
    }
  }

  /**
   * Get comprehensive statistics for a specific child
   */
  async getChildStatistics(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user._id || req.user.userId;
      const userRole = req.user.role;

      // Validate MongoDB ObjectId format
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new AppError('Invalid child ID format', 400);
      }

      const child = await Child.findById(id);
      if (!child) {
        throw new AppError(ERROR_MESSAGES.CHILD_NOT_FOUND || 'Child not found', 404);
      }

      // Check permissions
      if (userRole === USER_ROLES.PARENT && child.parent.toString() !== userId.toString()) {
        throw new AppError(ERROR_MESSAGES.CHILD_NOT_OWNED || 'Access denied to this child', 403);
      }

      const now = new Date();
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      // Get vaccination statistics using Promise.all for better performance
      const [vaccinationStats, upcomingVaccinations, overdueVaccinations, allRecords] = await Promise.all([
        VaccinationRecord.aggregate([
          { $match: { child: child._id } },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 }
            }
          }
        ]),
        VaccinationRecord.countDocuments({
          child: id,
          status: 'scheduled',
          scheduledDate: {
            $gte: now,
            $lte: thirtyDaysFromNow
          }
        }),
        VaccinationRecord.countDocuments({
          child: id,
          status: { $in: ['scheduled', 'overdue'] },
          scheduledDate: { $lt: now }
        }),
        VaccinationRecord.find({ child: id })
      ]);

      const stats = {
        childInfo: {
          id: child._id,
          name: `${child.firstName} ${child.lastName}`,
          firstName: child.firstName,
          lastName: child.lastName,
          gender: child.gender,
          bloodType: child.bloodType,
          age: calculateAge(child.dateOfBirth),
          ageInMonths: calculateAge(child.dateOfBirth, 'months'),
          dateOfBirth: child.dateOfBirth
        },
        vaccinationStatus: vaccinationStats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {}),
        upcomingVaccinations,
        overdueVaccinations,
        totalVaccinations: vaccinationStats.reduce((sum, stat) => sum + stat.count, 0),
        completionRate: calculateVaccinationProgress(allRecords),
        healthInfo: {
          allergies: child.allergies || [],
          medicalConditions: child.medicalConditions || [],
          emergencyContact: child.emergencyContact || null
        }
      };

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Child statistics retrieved successfully', { stats })
      );

    } catch (error) {
      logger.error('Get child statistics error:', error);
      next(error);
    }
  }

  /**
   * Search children with various filters
   */
  async searchChildren(req, res, next) {
    try {
      const { 
        q, 
        parentId,
        gender,
        ageMin,
        ageMax,
        limit = 10 
      } = req.query;
      const userId = req.user._id || req.user.userId;
      const userRole = req.user.role;

      if (!q || q.trim().length < 2) {
        throw new AppError('Search query must be at least 2 characters long', 400);
      }

      const searchTerm = q.trim();
      const searchLimit = Math.min(50, Math.max(1, parseInt(limit)));

      let filter = {
        isActive: { $ne: false },
        $or: [
          { firstName: { $regex: searchTerm, $options: 'i' } },
          { lastName: { $regex: searchTerm, $options: 'i' } }
        ]
      };

      // Parents can only search their own children
      if (userRole === USER_ROLES.PARENT) {
        filter.parent = userId;
      } else if (parentId) {
        if (!parentId.match(/^[0-9a-fA-F]{24}$/)) {
          throw new AppError('Invalid parent ID format', 400);
        }
        filter.parent = parentId;
      }

      if (gender && ['male', 'female', 'other'].includes(gender)) {
        filter.gender = gender;
      }

      // Age range filter
      if (ageMin || ageMax) {
        const now = new Date();
        if (ageMin) {
          const minDate = new Date(now.getFullYear() - parseInt(ageMin), now.getMonth(), now.getDate());
          filter.dateOfBirth = { ...filter.dateOfBirth, $lte: minDate };
        }
        if (ageMax) {
          const maxDate = new Date(now.getFullYear() - parseInt(ageMax), now.getMonth(), now.getDate());
          filter.dateOfBirth = { ...filter.dateOfBirth, $gte: maxDate };
        }
      }

      const children = await Child.find(filter)
        .populate('parent', 'name email')
        .limit(searchLimit)
        .sort({ firstName: 1, lastName: 1 })
        .lean();

      const childrenWithAge = children.map(child => ({
        ...child,
        age: calculateAge(child.dateOfBirth),
        ageInMonths: calculateAge(child.dateOfBirth, 'months')
      }));

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Children search completed', { 
          children: childrenWithAge, 
          total: children.length,
          searchTerm 
        })
      );

    } catch (error) {
      logger.error('Search children error:', error);
      next(error);
    }
  }

  /**
   * Upload profile image for a child
   */
  async uploadChildImage(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user._id || req.user.userId;
      const userRole = req.user.role;

      // Validate MongoDB ObjectId format
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new AppError('Invalid child ID format', 400);
      }

      if (!req.file) {
        throw new AppError('No image file provided', 400);
      }

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(req.file.mimetype)) {
        throw new AppError('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed', 400);
      }

      const child = await Child.findById(id);
      if (!child) {
        throw new AppError(ERROR_MESSAGES.CHILD_NOT_FOUND || 'Child not found', 404);
      }

      // Check permissions
      if (userRole === USER_ROLES.PARENT && child.parent.toString() !== userId.toString()) {
        throw new AppError(ERROR_MESSAGES.CHILD_NOT_OWNED || 'Access denied to this child', 403);
      }

      const updatedChild = await Child.findByIdAndUpdate(
        id,
        { profileImage: req.file.filename },
        { new: true }
      );

      logger.info(`Profile image updated for child: ${updatedChild.firstName} ${updatedChild.lastName}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Child profile image uploaded successfully', { 
          profileImage: updatedChild.profileImage 
        })
      );

    } catch (error) {
      logger.error('Upload child image error:', error);
      next(error);
    }
  }

  /**
   * Export children data (Admin/Doctor only)
   */
  async exportChildren(req, res, next) {
    try {
      const { format = 'json', parentId } = req.query;
      const userRole = req.user.role;

      // Only admins and doctors can export data
      if (userRole === USER_ROLES.PARENT) {
        throw new AppError(ERROR_MESSAGES.ACCESS_DENIED || 'Access denied', 403);
      }

      let filter = { isActive: { $ne: false } };
      if (parentId) {
        if (!parentId.match(/^[0-9a-fA-F]{24}$/)) {
          throw new AppError('Invalid parent ID format', 400);
        }
        filter.parent = parentId;
      }

      const children = await Child.find(filter)
        .populate('parent', 'name email phone')
        .sort({ firstName: 1, lastName: 1 })
        .lean();

      const childrenData = children.map(child => ({
        ...child,
        age: calculateAge(child.dateOfBirth),
        ageInMonths: calculateAge(child.dateOfBirth, 'months'),
        ageInDays: calculateAge(child.dateOfBirth, 'days')
      }));

      if (format === 'csv') {
        const csv = this.convertChildrenToCSV(childrenData);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="children.csv"');
        return res.send(csv);
      }

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Children exported successfully', { 
          children: childrenData, 
          total: childrenData.length,
          exportedAt: new Date(),
          filters: { parentId }
        })
      );

    } catch (error) {
      logger.error('Export children error:', error);
      next(error);
    }
  }

  /**
   * Convert children array to CSV format
   * @private
   * @param {Array} children - Children array
   * @returns {String} CSV string
   */
  convertChildrenToCSV(children) {
    if (children.length === 0) {
      return 'No data available';
    }

    const headers = [
      'ID', 'First Name', 'Last Name', 'Date of Birth', 'Age (Years)', 
      'Age (Months)', 'Gender', 'Blood Type', 'Parent Name', 'Parent Email',
      'Allergies', 'Medical Conditions', 'Doctor Name', 'Created At'
    ];

    const rows = children.map(child => [
      child._id || '',
      child.firstName || '',
      child.lastName || '',
      child.dateOfBirth ? new Date(child.dateOfBirth).toISOString().split('T')[0] : '',
      child.age || '',
      child.ageInMonths || '',
      child.gender || '',
      child.bloodType || '',
      child.parent ? `${child.parent.name || child.parent.firstName || ''} ${child.parent.lastName || ''}`.trim() : '',
      child.parent ? child.parent.email || '' : '',
      child.allergies ? child.allergies.join('; ') : '',
      child.medicalConditions ? child.medicalConditions.join('; ') : '',
      child.doctorInfo ? child.doctorInfo.name || '' : '',
      child.createdAt ? new Date(child.createdAt).toISOString() : ''
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    return csvContent;
  }

  /**
   * Get children by age range
   */
  async getChildrenByAgeRange(req, res, next) {
    try {
      const { 
        minAge = 0, 
        maxAge = 18, 
        unit = 'years',
        page = 1,
        limit = 10
      } = req.query;
      const userId = req.user._id || req.user.userId;
      const userRole = req.user.role;

      // Validate age parameters
      const minAgeNum = Math.max(0, parseInt(minAge));
      const maxAgeNum = Math.max(minAgeNum, parseInt(maxAge));
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(50, Math.max(1, parseInt(limit)));

      // Calculate date ranges
      const now = new Date();
      let minDate, maxDate;

      switch (unit) {
        case 'days':
          minDate = new Date(now.getTime() - (maxAgeNum * 24 * 60 * 60 * 1000));
          maxDate = new Date(now.getTime() - (minAgeNum * 24 * 60 * 60 * 1000));
          break;
        case 'months':
          minDate = new Date(now.getFullYear(), now.getMonth() - maxAgeNum, now.getDate());
          maxDate = new Date(now.getFullYear(), now.getMonth() - minAgeNum, now.getDate());
          break;
        case 'years':
        default:
          minDate = new Date(now.getFullYear() - maxAgeNum, now.getMonth(), now.getDate());
          maxDate = new Date(now.getFullYear() - minAgeNum, now.getMonth(), now.getDate());
          break;
      }

      let filter = {
        isActive: { $ne: false },
        dateOfBirth: {
          $gte: minDate,
          $lte: maxDate
        }
      };

      // Parents can only see their own children
      if (userRole === USER_ROLES.PARENT) {
        filter.parent = userId;
      }

      const query = Child.find(filter)
        .populate('parent', 'name email');

      const result = await paginateResults(
        query,
        pageNum,
        limitNum,
        'dateOfBirth',
        'desc'
      );

      // Add age calculations
      const childrenWithAge = result.data.map(child => ({
        ...child.toObject(),
        age: calculateAge(child.dateOfBirth),
        ageInMonths: calculateAge(child.dateOfBirth, 'months'),
        ageInDays: calculateAge(child.dateOfBirth, 'days')
      }));

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(
          true,
          'Children by age range retrieved successfully',
          childrenWithAge,
          { 
            pagination: result.pagination,
            ageFilter: { minAge: minAgeNum, maxAge: maxAgeNum, unit }
          }
        )
      );

    } catch (error) {
      logger.error('Get children by age range error:', error);
      next(error);
    }
  }

  /**
   * Get children with upcoming vaccinations
   */
  async getChildrenWithUpcomingVaccinations(req, res, next) {
    try {
      const { days = 30 } = req.query;
      const userId = req.user._id || req.user.userId;
      const userRole = req.user.role;

      const daysNum = Math.min(365, Math.max(1, parseInt(days)));
      const futureDate = new Date(Date.now() + (daysNum * 24 * 60 * 60 * 1000));

      // Build aggregation pipeline
      let matchStage = {
        status: 'scheduled',
        scheduledDate: {
          $gte: new Date(),
          $lte: futureDate
        }
      };

      const pipeline = [
        { $match: matchStage },
        {
          $lookup: {
            from: 'children',
            localField: 'child',
            foreignField: '_id',
            as: 'childInfo'
          }
        },
        { $unwind: '$childInfo' },
        {
          $match: {
            'childInfo.isActive': { $ne: false }
          }
        },
        {
          $lookup: {
            from: 'vaccines',
            localField: 'vaccine',
            foreignField: '_id',
            as: 'vaccineInfo'
          }
        },
        { $unwind: '$vaccineInfo' },
        {
          $lookup: {
            from: 'users',
            localField: 'childInfo.parent',
            foreignField: '_id',
            as: 'parentInfo'
          }
        },
        { $unwind: '$parentInfo' }
      ];

      // Add parent filter for non-admin users
      if (userRole === USER_ROLES.PARENT) {
        pipeline.push({
          $match: { 'childInfo.parent': userId }
        });
      }

      pipeline.push({ $sort: { scheduledDate: 1 } });

      const upcomingVaccinations = await VaccinationRecord.aggregate(pipeline);

      // Group by child
      const childrenMap = new Map();

      upcomingVaccinations.forEach(record => {
        const childId = record.childInfo._id.toString();
        
        if (!childrenMap.has(childId)) {
          childrenMap.set(childId, {
            child: {
              ...record.childInfo,
              age: calculateAge(record.childInfo.dateOfBirth),
              ageInMonths: calculateAge(record.childInfo.dateOfBirth, 'months')
            },
            parent: {
              _id: record.parentInfo._id,
              name: record.parentInfo.name,
              email: record.parentInfo.email
            },
            upcomingVaccinations: []
          });
        }

        childrenMap.get(childId).upcomingVaccinations.push({
          _id: record._id,
          scheduledDate: record.scheduledDate,
          doseNumber: record.doseNumber,
          vaccine: {
            _id: record.vaccineInfo._id,
            name: record.vaccineInfo.name,
            type: record.vaccineInfo.type
          },
          notes: record.notes,
          daysUntil: Math.ceil((record.scheduledDate - new Date()) / (1000 * 60 * 60 * 24))
        });
      });

      const childrenWithUpcoming = Array.from(childrenMap.values())
        .sort((a, b) => a.upcomingVaccinations[0].scheduledDate - b.upcomingVaccinations[0].scheduledDate);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(
          true,
          'Children with upcoming vaccinations retrieved successfully',
          {
            children: childrenWithUpcoming,
            total: childrenWithUpcoming.length,
            daysAhead: daysNum
          }
        )
      );

    } catch (error) {
      logger.error('Get children with upcoming vaccinations error:', error);
      next(error);
    }
  }

  /**
   * Get children with overdue vaccinations
   */
  async getChildrenWithOverdueVaccinations(req, res, next) {
    try {
      const userId = req.user._id || req.user.userId;
      const userRole = req.user.role;

      const pipeline = [
        {
          $match: {
            status: { $in: ['scheduled', 'overdue'] },
            scheduledDate: { $lt: new Date() }
          }
        },
        {
          $lookup: {
            from: 'children',
            localField: 'child',
            foreignField: '_id',
            as: 'childInfo'
          }
        },
        { $unwind: '$childInfo' },
        {
          $match: {
            'childInfo.isActive': { $ne: false }
          }
        },
        {
          $lookup: {
            from: 'vaccines',
            localField: 'vaccine',
            foreignField: '_id',
            as: 'vaccineInfo'
          }
        },
        { $unwind: '$vaccineInfo' },
        {
          $lookup: {
            from: 'users',
            localField: 'childInfo.parent',
            foreignField: '_id',
            as: 'parentInfo'
          }
        },
        { $unwind: '$parentInfo' }
      ];

      // Add parent filter for non-admin users
      if (userRole === USER_ROLES.PARENT) {
        pipeline.push({
          $match: { 'childInfo.parent': userId }
        });
      }

      const overdueVaccinations = await VaccinationRecord.aggregate(pipeline);

      // Group by child and calculate days overdue
      const childrenMap = new Map();

      overdueVaccinations.forEach(record => {
        const childId = record.childInfo._id.toString();
        const daysOverdue = Math.ceil((new Date() - record.scheduledDate) / (1000 * 60 * 60 * 24));
        
        if (!childrenMap.has(childId)) {
          childrenMap.set(childId, {
            child: {
              ...record.childInfo,
              age: calculateAge(record.childInfo.dateOfBirth),
              ageInMonths: calculateAge(record.childInfo.dateOfBirth, 'months')
            },
            parent: {
              _id: record.parentInfo._id,
              name: record.parentInfo.name,
              email: record.parentInfo.email
            },
            overdueVaccinations: []
          });
        }

        childrenMap.get(childId).overdueVaccinations.push({
          _id: record._id,
          scheduledDate: record.scheduledDate,
          doseNumber: record.doseNumber,
          daysOverdue,
          urgencyLevel: daysOverdue > 90 ? 'critical' : daysOverdue > 30 ? 'high' : 'medium',
          vaccine: {
            _id: record.vaccineInfo._id,
            name: record.vaccineInfo.name,
            type: record.vaccineInfo.type
          },
          status: record.status
        });
      });

      const childrenWithOverdue = Array.from(childrenMap.values())
        .sort((a, b) => {
          const maxOverdueA = Math.max(...a.overdueVaccinations.map(v => v.daysOverdue));
          const maxOverdueB = Math.max(...b.overdueVaccinations.map(v => v.daysOverdue));
          return maxOverdueB - maxOverdueA; // Most overdue first
        });

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(
          true,
          'Children with overdue vaccinations retrieved successfully',
          {
            children: childrenWithOverdue,
            total: childrenWithOverdue.length,
            summary: {
              critical: childrenWithOverdue.filter(c => 
                c.overdueVaccinations.some(v => v.urgencyLevel === 'critical')
              ).length,
              high: childrenWithOverdue.filter(c => 
                c.overdueVaccinations.some(v => v.urgencyLevel === 'high')
              ).length,
              medium: childrenWithOverdue.filter(c => 
                c.overdueVaccinations.some(v => v.urgencyLevel === 'medium')
              ).length
            }
          }
        )
      );

    } catch (error) {
      logger.error('Get children with overdue vaccinations error:', error);
      next(error);
    }
  }

  /**
   * Get child vaccination history with detailed records
   */
  async getChildVaccinationHistory(req, res, next) {
    try {
      const { id } = req.params;
      const { includeUpcoming = true } = req.query;
      const userId = req.user._id || req.user.userId;
      const userRole = req.user.role;

      // Validate MongoDB ObjectId format
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new AppError('Invalid child ID format', 400);
      }

      const child = await Child.findById(id);
      if (!child) {
        throw new AppError(ERROR_MESSAGES.CHILD_NOT_FOUND || 'Child not found', 404);
      }

      // Check permissions
      if (userRole === USER_ROLES.PARENT && child.parent.toString() !== userId.toString()) {
        throw new AppError(ERROR_MESSAGES.CHILD_NOT_OWNED || 'Access denied to this child', 403);
      }

      let filter = { child: id, isActive: { $ne: false } };
      
      // Optionally exclude future scheduled vaccinations
      if (includeUpcoming !== 'true') {
        filter.$or = [
          { status: { $in: ['completed', 'missed', 'cancelled'] } },
          { status: 'scheduled', scheduledDate: { $lt: new Date() } }
        ];
      }

      const vaccinationHistory = await VaccinationRecord.find(filter)
        .populate('vaccine', 'name type manufacturer schedule description')
        .populate('administeredBy', 'name email')
        .sort({ scheduledDate: -1 });

      // Group by vaccine type for better organization
      const historyByVaccine = {};
      vaccinationHistory.forEach(record => {
        const vaccineName = record.vaccine.name;
        if (!historyByVaccine[vaccineName]) {
          historyByVaccine[vaccineName] = [];
        }
        historyByVaccine[vaccineName].push({
          ...record.toObject(),
          ageAtSchedule: calculateAge(child.dateOfBirth, 'months', record.scheduledDate),
          ageAtAdministration: record.administeredDate ? 
            calculateAge(child.dateOfBirth, 'months', record.administeredDate) : null
        });
      });

      const response = {
        child: {
          id: child._id,
          name: `${child.firstName} ${child.lastName}`,
          dateOfBirth: child.dateOfBirth,
          currentAge: {
            years: calculateAge(child.dateOfBirth),
            months: calculateAge(child.dateOfBirth, 'months')
          }
        },
        totalRecords: vaccinationHistory.length,
        historyByVaccine,
        chronologicalHistory: vaccinationHistory
      };

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Child vaccination history retrieved successfully', response)
      );

    } catch (error) {
      logger.error('Get child vaccination history error:', error);
      next(error);
    }
  }
}

module.exports = new ChildController();