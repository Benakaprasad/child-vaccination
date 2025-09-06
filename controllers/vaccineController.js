const Vaccine = require('../models/Vaccine');
const VaccinationRecord = require('../models/VaccinationRecord');
const vaccinationScheduler = require('../services/vaccinationScheduler');
const { 
  createApiResponse,
  paginateResults,
  removeEmptyFields,
  convertToDays 
} = require('../utils/helpers');
const { 
  HTTP_STATUS, 
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  USER_ROLES,
  VACCINE_TYPES 
} = require('../utils/constants');
const logger = require('../utils/logger');

class VaccineController {
   /**
 * Register a new user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
  async getAllVaccines(req, res, next) {
    try {
      const { 
        page = 1, 
        limit = 10, 
        sortBy = 'name', 
        sortOrder = 'asc',
        type,
        manufacturer,
        isActive,
        search
      } = req.query;

      // Build filter object
      let filter = {};
      
      if (type) {
        filter.type = type;
      }
      
      if (manufacturer) {
        filter.manufacturer = { $regex: manufacturer, $options: 'i' };
      }
      
      if (isActive !== undefined) {
        filter.isActive = isActive === 'true';
      }
      
      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { manufacturer: { $regex: search, $options: 'i' } }
        ];
      }

      const query = Vaccine.find(filter);
      
      const result = await paginateResults(
        query,
        parseInt(page),
        parseInt(limit),
        sortBy,
        sortOrder
      );

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(
          true,
          'Vaccines retrieved successfully',
          result.data,
          { pagination: result.pagination }
        )
      );

    } catch (error) {
      logger.error('Get all vaccines error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

   /**
 * Register a new user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
  async getVaccineById(req, res, next) {
    try {
      const { id } = req.params;

      const vaccine = await Vaccine.findById(id);

      if (!vaccine) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, ERROR_MESSAGES.VACCINE_NOT_FOUND)
        );
      }

      // Get usage statistics
      const usageStats = await VaccinationRecord.aggregate([
        { $match: { vaccine: vaccine._id } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      const vaccineData = {
        ...vaccine.toObject(),
        usageStatistics: usageStats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {}),
        totalUsage: usageStats.reduce((sum, stat) => sum + stat.count, 0)
      };

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Vaccine retrieved successfully', { vaccine: vaccineData })
      );

    } catch (error) {
      logger.error('Get vaccine by ID error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
 * Register a new user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
  async createVaccine(req, res, next) {
    try {
      const vaccineData = req.body;

      // Check if vaccine with same name already exists
      const existingVaccine = await Vaccine.findOne({ 
        name: { $regex: `^${vaccineData.name}$`, $options: 'i' } 
      });

      if (existingVaccine) {
        return res.status(HTTP_STATUS.CONFLICT).json(
          createApiResponse(false, ERROR_MESSAGES.VACCINE_ALREADY_EXISTS)
        );
      }

      // Create new vaccine
      const vaccine = new Vaccine(vaccineData);
      await vaccine.save();

      // Update vaccination schedules for existing children
      try {
        await vaccinationScheduler.updateSchedulesForNewVaccine(vaccine._id);
      } catch (scheduleError) {
        logger.error('Failed to update schedules for new vaccine:', scheduleError);
        // Don't fail vaccine creation if schedule update fails
      }

      logger.info(`New vaccine created: ${vaccine.name} by user ${req.user.email}`);

      res.status(HTTP_STATUS.CREATED).json(
        createApiResponse(true, 'Vaccine created successfully', { vaccine })
      );

    } catch (error) {
      logger.error('Create vaccine error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

   /**
 * Register a new user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
  async updateVaccine(req, res, next) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const vaccine = await Vaccine.findById(id);
      if (!vaccine) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, ERROR_MESSAGES.VACCINE_NOT_FOUND)
        );
      }

      // Check if name is being updated and doesn't conflict
      if (updates.name && updates.name !== vaccine.name) {
        const existingVaccine = await Vaccine.findOne({ 
          name: { $regex: `^${updates.name}$`, $options: 'i' },
          _id: { $ne: id }
        });

        if (existingVaccine) {
          return res.status(HTTP_STATUS.CONFLICT).json(
            createApiResponse(false, ERROR_MESSAGES.VACCINE_ALREADY_EXISTS)
          );
        }
      }

      // Remove fields that shouldn't be updated
      delete updates.createdAt;
      delete updates.updatedAt;

      // Clean empty fields
      const cleanedUpdates = removeEmptyFields(updates);

      const updatedVaccine = await Vaccine.findByIdAndUpdate(
        id,
        { $set: cleanedUpdates },
        { new: true, runValidators: true }
      );

      logger.info(`Vaccine updated: ${updatedVaccine.name} by user ${req.user.email}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Vaccine updated successfully', { vaccine: updatedVaccine })
      );

    } catch (error) {
      logger.error('Update vaccine error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

   /**
 * Register a new user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
  async deleteVaccine(req, res, next) {
    try {
      const { id } = req.params;

      const vaccine = await Vaccine.findById(id);
      if (!vaccine) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, ERROR_MESSAGES.VACCINE_NOT_FOUND)
        );
      }

      // Check if vaccine is used in any vaccination records
      const usageCount = await VaccinationRecord.countDocuments({ vaccine: id });
      
      if (usageCount > 0) {
        // Soft delete - deactivate instead of hard delete
        vaccine.isActive = false;
        await vaccine.save();
        
        logger.info(`Vaccine deactivated (has usage): ${vaccine.name} by user ${req.user.email}`);
        
        return res.status(HTTP_STATUS.OK).json(
          createApiResponse(true, 'Vaccine deactivated successfully (had existing usage records)')
        );
      }

      // Hard delete if no usage
      await Vaccine.findByIdAndDelete(id);

      logger.info(`Vaccine deleted: ${vaccine.name} by user ${req.user.email}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Vaccine deleted successfully')
      );

    } catch (error) {
      logger.error('Delete vaccine error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

   /**
 * Register a new user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
  async toggleVaccineStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { isActive } = req.body;

      const vaccine = await Vaccine.findByIdAndUpdate(
        id,
        { isActive },
        { new: true }
      );

      if (!vaccine) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, ERROR_MESSAGES.VACCINE_NOT_FOUND)
        );
      }

      const action = isActive ? 'activated' : 'deactivated';
      logger.info(`Vaccine ${action}: ${vaccine.name} by user ${req.user.email}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, `Vaccine ${action} successfully`, { 
          vaccine: {
            id: vaccine._id,
            name: vaccine.name,
            isActive: vaccine.isActive
          }
        })
      );

    } catch (error) {
      logger.error('Toggle vaccine status error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

   /**
 * Register a new user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
  async searchVaccines(req, res, next) {
    try {
      const { 
        q, 
        type, 
        manufacturer,
        limit = 10 
      } = req.query;

      if (!q || q.trim().length < 2) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json(
          createApiResponse(false, 'Search query must be at least 2 characters long')
        );
      }

      let filter = {
        isActive: true,
        $or: [
          { name: { $regex: q, $options: 'i' } },
          { description: { $regex: q, $options: 'i' } },
          { manufacturer: { $regex: q, $options: 'i' } }
        ]
      };

      if (type) {
        filter.type = type;
      }

      if (manufacturer) {
        filter.manufacturer = { $regex: manufacturer, $options: 'i' };
      }

      const vaccines = await Vaccine.find(filter)
        .select('name description type manufacturer ageGroups schedule')
        .limit(parseInt(limit))
        .sort({ name: 1 });

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Vaccines found', { vaccines, total: vaccines.length })
      );

    } catch (error) {
      logger.error('Search vaccines error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

   /**
 * Register a new user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
  async getVaccinesByType(req, res, next) {
    try {
      const { isActive = true } = req.query;

      const filter = { isActive: isActive === 'true' };

      const vaccinesByType = await Vaccine.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$type',
            vaccines: {
              $push: {
                _id: '$_id',
                name: '$name',
                description: '$description',
                manufacturer: '$manufacturer',
                ageGroups: '$ageGroups',
                schedule: '$schedule'
              }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      const formattedResult = vaccinesByType.reduce((acc, group) => {
        acc[group._id] = {
          vaccines: group.vaccines,
          count: group.count
        };
        return acc;
      }, {});

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Vaccines by type retrieved successfully', { 
          vaccinesByType: formattedResult 
        })
      );

    } catch (error) {
      logger.error('Get vaccines by type error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

   /**
 * Register a new user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
  async getManufacturers(req, res, next) {
    try {
      const manufacturers = await Vaccine.distinct('manufacturer', { isActive: true });
      
      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Manufacturers retrieved successfully', { 
          manufacturers: manufacturers.sort() 
        })
      );

    } catch (error) {
      logger.error('Get manufacturers error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

   /**
 * Register a new user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
  async getVaccinesForAge(req, res, next) {
    try {
      const { childAge } = req.params;
      const { unit = 'months' } = req.query;

      const ageInDays = convertToDays(parseInt(childAge), unit);

      // Find vaccines that are recommended for this age
      const vaccines = await Vaccine.find({
        isActive: true,
        'ageGroups': {
          $elemMatch: {
            $expr: {
              $and: [
                { $lte: [{ $multiply: ['$minAge', { $switch: {
                  branches: [
                    { case: { $eq: ['$unit', 'days'] }, then: 1 },
                    { case: { $eq: ['$unit', 'weeks'] }, then: 7 },
                    { case: { $eq: ['$unit', 'months'] }, then: 30.44 },
                    { case: { $eq: ['$unit', 'years'] }, then: 365.25 }
                  ],
                  default: 1
                }}]}, ageInDays] },
                { $gte: [{ $multiply: ['$maxAge', { $switch: {
                  branches: [
                    { case: { $eq: ['$unit', 'days'] }, then: 1 },
                    { case: { $eq: ['$unit', 'weeks'] }, then: 7 },
                    { case: { $eq: ['$unit', 'months'] }, then: 30.44 },
                    { case: { $eq: ['$unit', 'years'] }, then: 365.25 }
                  ],
                  default: 1
                }}]}, ageInDays] }
              ]
            }
          }
        }
      });

      // Filter schedule items that are due at this age
      const recommendedVaccines = vaccines.map(vaccine => {
        const relevantSchedule = vaccine.schedule.filter(dose => {
          const doseDays = dose.ageInDays;
          return doseDays <= ageInDays + 30; // Include doses due within 30 days
        });

        return {
          ...vaccine.toObject(),
          relevantSchedule
        };
      }).filter(vaccine => vaccine.relevantSchedule.length > 0);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(
          true, 
          'Recommended vaccines retrieved successfully', 
          { 
            vaccines: recommendedVaccines,
            childAge: parseInt(childAge),
            unit,
            ageInDays
          }
        )
      );

    } catch (error) {
      logger.error('Get vaccines for age error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

   /**
 * Register a new user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
  async getVaccineStatistics(req, res, next) {
    try {
      // Get general statistics
      const totalVaccines = await Vaccine.countDocuments();
      const activeVaccines = await Vaccine.countDocuments({ isActive: true });
      
      // Get vaccines by type
      const vaccinesByType = await Vaccine.aggregate([
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
            active: { $sum: { $cond: ['$isActive', 1, 0] } }
          }
        }
      ]);

      // Get most used vaccines
      const mostUsedVaccines = await VaccinationRecord.aggregate([
        {
          $group: {
            _id: '$vaccine',
            usageCount: { $sum: 1 }
          }
        },
        {
          $lookup: {
            from: 'vaccines',
            localField: '_id',
            foreignField: '_id',
            as: 'vaccineInfo'
          }
        },
        { $unwind: '$vaccineInfo' },
        {
          $project: {
            name: '$vaccineInfo.name',
            type: '$vaccineInfo.type',
            manufacturer: '$vaccineInfo.manufacturer',
            usageCount: 1
          }
        },
        { $sort: { usageCount: -1 } },
        { $limit: 10 }
      ]);

      const stats = {
        total: totalVaccines,
        active: activeVaccines,
        inactive: totalVaccines - activeVaccines,
        byType: vaccinesByType.reduce((acc, stat) => {
          acc[stat._id] = {
            total: stat.count,
            active: stat.active,
            inactive: stat.count - stat.active
          };
          return acc;
        }, {}),
        mostUsed: mostUsedVaccines
      };

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Vaccine statistics retrieved successfully', { stats })
      );

    } catch (error) {
      logger.error('Get vaccine statistics error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

   /**
 * Register a new user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
  async getVaccineScheduleInfo(req, res, next) {
    try {
      const { id } = req.params;

      const vaccine = await Vaccine.findById(id);
      if (!vaccine) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, ERROR_MESSAGES.VACCINE_NOT_FOUND)
        );
      }

      // Calculate schedule timeline
      const scheduleTimeline = vaccine.schedule.map(dose => {
        const ageInDays = dose.ageInDays;
        const ageInWeeks = Math.floor(ageInDays / 7);
        const ageInMonths = Math.floor(ageInDays / 30.44);
        const ageInYears = Math.floor(ageInDays / 365.25);

        return {
          ...dose.toObject(),
          timeline: {
            days: ageInDays,
            weeks: ageInWeeks,
            months: ageInMonths,
            years: ageInYears,
            displayAge: this.formatAge(ageInDays)
          }
        };
      });

      const scheduleInfo = {
        vaccine: {
          _id: vaccine._id,
          name: vaccine.name,
          type: vaccine.type,
          manufacturer: vaccine.manufacturer
        },
        totalDoses: vaccine.schedule.length,
        scheduleTimeline,
        ageGroups: vaccine.ageGroups,
        sideEffects: vaccine.sideEffects,
        contraindications: vaccine.contraindications
      };

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Vaccine schedule info retrieved successfully', scheduleInfo)
      );

    } catch (error) {
      logger.error('Get vaccine schedule info error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

   /**
 * Register a new user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
  async bulkCreateVaccines(req, res, next) {
    try {
      const { vaccines } = req.body;

      const results = [];
      const errors = [];

      for (let i = 0; i < vaccines.length; i++) {
        try {
          const vaccineData = vaccines[i];
          
          // Check if vaccine already exists
          const existingVaccine = await Vaccine.findOne({ 
            name: { $regex: `^${vaccineData.name}$`, $options: 'i' } 
          });

          if (existingVaccine) {
            errors.push({
              index: i,
              name: vaccineData.name,
              error: 'Vaccine already exists'
            });
            continue;
          }

          const vaccine = new Vaccine(vaccineData);
          await vaccine.save();
          results.push(vaccine);

        } catch (error) {
          errors.push({
            index: i,
            name: vaccines[i].name || 'Unknown',
            error: error.message
          });
        }
      }

      logger.info(`Bulk vaccine creation: ${results.length} successful, ${errors.length} failed by user ${req.user.email}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(
          true, 
          `Bulk vaccine creation completed: ${results.length} successful, ${errors.length} failed`,
          {
            successful: results,
            errors,
            totalProcessed: vaccines.length,
            successCount: results.length,
            errorCount: errors.length
          }
        )
      );

    } catch (error) {
      logger.error('Bulk create vaccines error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

   /**
 * Register a new user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
  async getVaccineUsageStatistics(req, res, next) {
    try {
      const { id } = req.params;
      const { startDate, endDate } = req.query;

      const vaccine = await Vaccine.findById(id);
      if (!vaccine) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, ERROR_MESSAGES.VACCINE_NOT_FOUND)
        );
      }

      // Build date filter
      let dateFilter = { vaccine: id };
      if (startDate && endDate) {
        dateFilter.createdAt = {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        };
      }

      // Get usage statistics
      const usageStats = await VaccinationRecord.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      // Get monthly usage trend (last 12 months)
      const monthlyUsage = await VaccinationRecord.aggregate([
        { 
          $match: { 
            vaccine: id,
            createdAt: {
              $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
            }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]);

      const statistics = {
        vaccine: {
          _id: vaccine._id,
          name: vaccine.name,
          type: vaccine.type
        },
        usageByStatus: usageStats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {}),
        totalUsage: usageStats.reduce((sum, stat) => sum + stat.count, 0),
        monthlyTrend: monthlyUsage,
        dateRange: {
          startDate: startDate || 'All time',
          endDate: endDate || 'Present'
        }
      };

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Vaccine usage statistics retrieved successfully', { statistics })
      );

    } catch (error) {
      logger.error('Get vaccine usage statistics error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Format age in days to human readable format
   * @private
   * @param {Number} ageInDays - Age in days
   * @returns {String} Formatted age string
   */
  formatAge(ageInDays) {
    if (ageInDays === 0) return 'Birth';
    if (ageInDays < 7) return `${ageInDays} day${ageInDays !== 1 ? 's' : ''}`;
    if (ageInDays < 30) {
      const weeks = Math.floor(ageInDays / 7);
      return `${weeks} week${weeks !== 1 ? 's' : ''}`;
    }
    if (ageInDays < 365) {
      const months = Math.floor(ageInDays / 30.44);
      return `${months} month${months !== 1 ? 's' : ''}`;
    }
    const years = Math.floor(ageInDays / 365.25);
    return `${years} year${years !== 1 ? 's' : ''}`;
  }
}

module.exports = new VaccineController();