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
const logger = require('../utils/logger');

class ChildController {
  /**
   * Get all children for the current user
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getChildren(req, res) {
    try {
      const userId = req.user.userId;
      const userRole = req.user.role;

      let filter = {};
      
      // Parents can only see their own children
      if (userRole === USER_ROLES.PARENT) {
        filter.parent = userId;
      }
      // Doctors and admins can see all children (with optional filters)
      else if (userRole === USER_ROLES.DOCTOR || userRole === USER_ROLES.ADMIN) {
        const { parentId } = req.query;
        if (parentId) {
          filter.parent = parentId;
        }
      }

      const children = await Child.find(filter)
        .populate('parent', 'firstName lastName email phone')
        .sort({ firstName: 1, lastName: 1 });

      // Add calculated fields
      const childrenWithStats = children.map(child => {
        const childObj = child.toObject();
        childObj.age = calculateAge(child.dateOfBirth);
        childObj.ageInMonths = calculateAge(child.dateOfBirth, 'months');
        return childObj;
      });

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(
          true, 
          'Children retrieved successfully', 
          { children: childrenWithStats }
        )
      );

    } catch (error) {
      logger.error('Get children error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Get child by ID
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getChildById(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const userRole = req.user.role;

      const child = await Child.findById(id)
        .populate('parent', 'firstName lastName email phone');

      if (!child) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, ERROR_MESSAGES.CHILD_NOT_FOUND)
        );
      }

      // Check permissions: parents can only access their own children
      if (userRole === USER_ROLES.PARENT && child.parent._id.toString() !== userId) {
        return res.status(HTTP_STATUS.FORBIDDEN).json(
          createApiResponse(false, ERROR_MESSAGES.CHILD_NOT_OWNED)
        );
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
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Create a new child
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async createChild(req, res) {
    try {
      const userId = req.user.userId;
      const userRole = req.user.role;
      const childData = req.body;

      // Determine parent ID
      let parentId = userId; // Default to current user for parents
      
      // Doctors and admins can specify different parent
      if ((userRole === USER_ROLES.DOCTOR || userRole === USER_ROLES.ADMIN) && childData.parent) {
        parentId = childData.parent;
      }

      // Verify parent exists
      const parent = await User.findById(parentId);
      if (!parent) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, 'Parent user not found')
        );
      }

      // Create child
      const child = new Child({
        ...childData,
        parent: parentId
      });

      await child.save();

      // Add child to parent's children array
      await User.findByIdAndUpdate(
        parentId,
        { $push: { children: child._id } }
      );

      // Generate vaccination schedule for the new child
      try {
        await vaccinationScheduler.generateScheduleForChild(child._id);
      } catch (scheduleError) {
        logger.error('Failed to generate vaccination schedule:', scheduleError);
        // Don't fail child creation if schedule generation fails
      }

      // Populate parent information
      await child.populate('parent', 'firstName lastName email');

      const childResponse = {
        ...child.toObject(),
        age: calculateAge(child.dateOfBirth),
        ageInMonths: calculateAge(child.dateOfBirth, 'months')
      };

      logger.info(`New child created: ${child.firstName} ${child.lastName} for parent ${parent.email}`);

      res.status(HTTP_STATUS.CREATED).json(
        createApiResponse(true, SUCCESS_MESSAGES.CHILD_ADDED, { child: childResponse })
      );

    } catch (error) {
      logger.error('Create child error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Update child information
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async updateChild(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const userRole = req.user.role;
      const updates = req.body;

      const child = await Child.findById(id);
      if (!child) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, ERROR_MESSAGES.CHILD_NOT_FOUND)
        );
      }

      // Check permissions
      if (userRole === USER_ROLES.PARENT && child.parent.toString() !== userId) {
        return res.status(HTTP_STATUS.FORBIDDEN).json(
          createApiResponse(false, ERROR_MESSAGES.CHILD_NOT_OWNED)
        );
      }

      // Remove fields that shouldn't be updated
      delete updates.parent; // Parent can't be changed
      delete updates.createdAt;
      delete updates.updatedAt;

      // Clean empty fields
      const cleanedUpdates = removeEmptyFields(updates);

      const updatedChild = await Child.findByIdAndUpdate(
        id,
        { $set: cleanedUpdates },
        { new: true, runValidators: true }
      ).populate('parent', 'firstName lastName email');

      const childResponse = {
        ...updatedChild.toObject(),
        age: calculateAge(updatedChild.dateOfBirth),
        ageInMonths: calculateAge(updatedChild.dateOfBirth, 'months')
      };

      logger.info(`Child updated: ${updatedChild.firstName} ${updatedChild.lastName}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, SUCCESS_MESSAGES.CHILD_UPDATED, { child: childResponse })
      );

    } catch (error) {
      logger.error('Update child error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Delete a child
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async deleteChild(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const userRole = req.user.role;

      const child = await Child.findById(id);
      if (!child) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, ERROR_MESSAGES.CHILD_NOT_FOUND)
        );
      }

      // Check permissions
      if (userRole === USER_ROLES.PARENT && child.parent.toString() !== userId) {
        return res.status(HTTP_STATUS.FORBIDDEN).json(
          createApiResponse(false, ERROR_MESSAGES.CHILD_NOT_OWNED)
        );
      }

      // Remove child from parent's children array
      await User.findByIdAndUpdate(
        child.parent,
        { $pull: { children: child._id } }
      );

      // Delete associated vaccination records
      await VaccinationRecord.deleteMany({ child: id });

      // Delete the child
      await Child.findByIdAndDelete(id);

      logger.info(`Child deleted: ${child.firstName} ${child.lastName}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, SUCCESS_MESSAGES.CHILD_DELETED)
      );

    } catch (error) {
      logger.error('Delete child error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Get child's vaccination schedule
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getVaccinationSchedule(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const userRole = req.user.role;

      const child = await Child.findById(id);
      if (!child) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, ERROR_MESSAGES.CHILD_NOT_FOUND)
        );
      }

      // Check permissions
      if (userRole === USER_ROLES.PARENT && child.parent.toString() !== userId) {
        return res.status(HTTP_STATUS.FORBIDDEN).json(
          createApiResponse(false, ERROR_MESSAGES.CHILD_NOT_OWNED)
        );
      }

      const vaccinationRecords = await VaccinationRecord.find({ child: id })
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

      vaccinationRecords.forEach(record => {
        scheduleByStatus[record.status].push(record);
      });

      // Calculate progress
      const totalVaccinations = vaccinationRecords.length;
      const completedVaccinations = scheduleByStatus.completed.length;
      const progress = totalVaccinations > 0 ? 
        Math.round((completedVaccinations / totalVaccinations) * 100) : 0;

      const scheduleData = {
        childId: id,
        childName: `${child.firstName} ${child.lastName}`,
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
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Generate vaccination schedule for a child
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async generateVaccinationSchedule(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const userRole = req.user.role;

      const child = await Child.findById(id);
      if (!child) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, ERROR_MESSAGES.CHILD_NOT_FOUND)
        );
      }

      // Check permissions
      if (userRole === USER_ROLES.PARENT && child.parent.toString() !== userId) {
        return res.status(HTTP_STATUS.FORBIDDEN).json(
          createApiResponse(false, ERROR_MESSAGES.CHILD_NOT_OWNED)
        );
      }

      // Generate vaccination schedule
      const scheduleResult = await vaccinationScheduler.generateScheduleForChild(id);

      logger.info(`Vaccination schedule generated for child: ${child.firstName} ${child.lastName}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(
          true, 
          'Vaccination schedule generated successfully', 
          scheduleResult
        )
      );

    } catch (error) {
      logger.error('Generate vaccination schedule error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Get child statistics
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getChildStatistics(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const userRole = req.user.role;

      const child = await Child.findById(id);
      if (!child) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, ERROR_MESSAGES.CHILD_NOT_FOUND)
        );
      }

      // Check permissions
      if (userRole === USER_ROLES.PARENT && child.parent.toString() !== userId) {
        return res.status(HTTP_STATUS.FORBIDDEN).json(
          createApiResponse(false, ERROR_MESSAGES.CHILD_NOT_OWNED)
        );
      }

      // Get vaccination statistics
      const vaccinationStats = await VaccinationRecord.aggregate([
        { $match: { child: child._id } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      // Get upcoming vaccinations (next 30 days)
      const upcomingVaccinations = await VaccinationRecord.countDocuments({
        child: id,
        status: 'scheduled',
        scheduledDate: {
          $gte: new Date(),
          $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        }
      });

      // Get overdue vaccinations
      const overdueVaccinations = await VaccinationRecord.countDocuments({
        child: id,
        status: { $in: ['scheduled', 'overdue'] },
        scheduledDate: { $lt: new Date() }
      });

      const stats = {
        childInfo: {
          id: child._id,
          name: `${child.firstName} ${child.lastName}`,
          age: calculateAge(child.dateOfBirth),
          ageInMonths: calculateAge(child.dateOfBirth, 'months')
        },
        vaccinationStatus: vaccinationStats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {}),
        upcomingVaccinations,
        overdueVaccinations,
        totalVaccinations: vaccinationStats.reduce((sum, stat) => sum + stat.count, 0),
        completionRate: calculateVaccinationProgress(
          await VaccinationRecord.find({ child: id })
        )
      };

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Child statistics retrieved successfully', { stats })
      );

    } catch (error) {
      logger.error('Get child statistics error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Search children
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async searchChildren(req, res) {
    try {
      const { 
        q, 
        parentId,
        gender,
        limit = 10 
      } = req.query;
      const userId = req.user.userId;
      const userRole = req.user.role;

      if (!q || q.trim().length < 2) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json(
          createApiResponse(false, 'Search query must be at least 2 characters long')
        );
      }

      let filter = {
        $or: [
          { firstName: { $regex: q, $options: 'i' } },
          { lastName: { $regex: q, $options: 'i' } }
        ]
      };

      // Parents can only search their own children
      if (userRole === USER_ROLES.PARENT) {
        filter.parent = userId;
      } else if (parentId) {
        filter.parent = parentId;
      }

      if (gender) {
        filter.gender = gender;
      }

      const children = await Child.find(filter)
        .populate('parent', 'firstName lastName email')
        .limit(parseInt(limit))
        .sort({ firstName: 1, lastName: 1 });

      const childrenWithAge = children.map(child => ({
        ...child.toObject(),
        age: calculateAge(child.dateOfBirth),
        ageInMonths: calculateAge(child.dateOfBirth, 'months')
      }));

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Children found', { 
          children: childrenWithAge, 
          total: children.length 
        })
      );

    } catch (error) {
      logger.error('Search children error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Upload child's profile image
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async uploadChildImage(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const userRole = req.user.role;

      if (!req.file) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json(
          createApiResponse(false, 'No image file provided')
        );
      }

      const child = await Child.findById(id);
      if (!child) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, ERROR_MESSAGES.CHILD_NOT_FOUND)
        );
      }

      // Check permissions
      if (userRole === USER_ROLES.PARENT && child.parent.toString() !== userId) {
        return res.status(HTTP_STATUS.FORBIDDEN).json(
          createApiResponse(false, ERROR_MESSAGES.CHILD_NOT_OWNED)
        );
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
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Export child data (Admin/Doctor only)
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async exportChildren(req, res) {
    try {
      const { format = 'json', parentId } = req.query;
      const userRole = req.user.role;

      // Only admins and doctors can export data
      if (userRole === USER_ROLES.PARENT) {
        return res.status(HTTP_STATUS.FORBIDDEN).json(
          createApiResponse(false, ERROR_MESSAGES.ACCESS_DENIED)
        );
      }

      let filter = {};
      if (parentId) filter.parent = parentId;

      const children = await Child.find(filter)
        .populate('parent', 'firstName lastName email phone')
        .sort({ firstName: 1, lastName: 1 });

      const childrenData = children.map(child => ({
        ...child.toObject(),
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
          exportedAt: new Date()
        })
      );

    } catch (error) {
      logger.error('Export children error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Convert children array to CSV format
   * @private
   * @param {Array} children - Children array
   * @returns {String} CSV string
   */
  convertChildrenToCSV(children) {
    const headers = [
      'ID', 'First Name', 'Last Name', 'Date of Birth', 'Age (Years)', 
      'Age (Months)', 'Gender', 'Blood Type', 'Parent Name', 'Parent Email',
      'Allergies', 'Medical Conditions', 'Doctor Name', 'Created At'
    ];

    const rows = children.map(child => [
      child._id,
      child.firstName,
      child.lastName,
      child.dateOfBirth.toISOString().split('T')[0],
      child.age,
      child.ageInMonths,
      child.gender,
      child.bloodType || '',
      child.parent ? `${child.parent.firstName} ${child.parent.lastName}` : '',
      child.parent ? child.parent.email : '',
      child.allergies ? child.allergies.join('; ') : '',
      child.medicalConditions ? child.medicalConditions.join('; ') : '',
      child.doctorInfo ? child.doctorInfo.name || '' : '',
      child.createdAt.toISOString()
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');

    return csvContent;
  }

  /**
   * Get children by age range
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getChildrenByAgeRange(req, res) {
    try {
      const { 
        minAge = 0, 
        maxAge = 18, 
        unit = 'years',
        page = 1,
        limit = 10
      } = req.query;
      const userId = req.user.userId;
      const userRole = req.user.role;

      // Calculate date ranges
      const now = new Date();
      let minDate, maxDate;

      switch (unit) {
        case 'days':
          minDate = new Date(now.getTime() - (maxAge * 24 * 60 * 60 * 1000));
          maxDate = new Date(now.getTime() - (minAge * 24 * 60 * 60 * 1000));
          break;
        case 'months':
          minDate = new Date(now.getFullYear(), now.getMonth() - maxAge, now.getDate());
          maxDate = new Date(now.getFullYear(), now.getMonth() - minAge, now.getDate());
          break;
        case 'years':
        default:
          minDate = new Date(now.getFullYear() - maxAge, now.getMonth(), now.getDate());
          maxDate = new Date(now.getFullYear() - minAge, now.getMonth(), now.getDate());
          break;
      }

      let filter = {
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
        .populate('parent', 'firstName lastName email');

      const result = await paginateResults(
        query,
        parseInt(page),
        parseInt(limit),
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
            ageFilter: { minAge, maxAge, unit }
          }
        )
      );

    } catch (error) {
      logger.error('Get children by age range error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Get children with upcoming vaccinations
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getChildrenWithUpcomingVaccinations(req, res) {
    try {
      const { days = 30 } = req.query;
      const userId = req.user.userId;
      const userRole = req.user.role;

      const futureDate = new Date(Date.now() + (parseInt(days) * 24 * 60 * 60 * 1000));

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
              firstName: record.parentInfo.firstName,
              lastName: record.parentInfo.lastName,
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
          notes: record.notes
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
            daysAhead: parseInt(days)
          }
        )
      );

    } catch (error) {
      logger.error('Get children with upcoming vaccinations error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Get children with overdue vaccinations
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getChildrenWithOverdueVaccinations(req, res) {
    try {
      const userId = req.user.userId;
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
              firstName: record.parentInfo.firstName,
              lastName: record.parentInfo.lastName,
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
            total: childrenWithOverdue.length
          }
        )
      );

    } catch (error) {
      logger.error('Get children with overdue vaccinations error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }
}

module.exports = new ChildController();