const VaccinationRecord = require('../models/VaccinationRecord');
const Child = require('../models/Child');
const Vaccine = require('../models/Vaccine');
const notificationService = require('../services/notificationService');
const { 
  createApiResponse,
  paginateResults,
  calculateAge,
  removeEmptyFields 
} = require('../utils/helpers');
const { 
  HTTP_STATUS, 
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  USER_ROLES,
  VACCINATION_STATUS 
} = require('../utils/constants');
const logger = require('../utils/logger');

class VaccinationRecordController {
  /**
   * Get vaccination records with filtering and pagination
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getVaccinationRecords(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = 'scheduledDate',
        sortOrder = 'asc',
        childId,
        vaccineId,
        status,
        startDate,
        endDate
      } = req.query;
      const userId = req.user.userId;
      const userRole = req.user.role;

      let filter = {};

      // Apply permission-based filtering
      if (userRole === USER_ROLES.PARENT) {
        const children = await Child.find({ parent: userId }).select('_id');
        filter.child = { $in: children.map(child => child._id) };
      }

      // Apply additional filters
      if (childId) filter.child = childId;
      if (vaccineId) filter.vaccine = vaccineId;
      if (status) filter.status = status;
      
      if (startDate && endDate) {
        filter.scheduledDate = {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        };
      }

      const query = VaccinationRecord.find(filter)
        .populate('child', 'firstName lastName dateOfBirth')
        .populate('vaccine', 'name type manufacturer');

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
          'Vaccination records retrieved successfully',
          result.data,
          { pagination: result.pagination }
        )
      );

    } catch (error) {
      logger.error('Get vaccination records error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Get vaccination record by ID
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getVaccinationRecordById(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const userRole = req.user.role;

      const record = await VaccinationRecord.findById(id)
        .populate('child', 'firstName lastName dateOfBirth parent')
        .populate('vaccine', 'name type manufacturer schedule sideEffects')
        .populate('createdBy', 'firstName lastName')
        .populate('completedBy', 'firstName lastName');

      if (!record) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, ERROR_MESSAGES.VACCINATION_RECORD_NOT_FOUND)
        );
      }

      // Check permissions
      if (userRole === USER_ROLES.PARENT && record.child.parent.toString() !== userId) {
        return res.status(HTTP_STATUS.FORBIDDEN).json(
          createApiResponse(false, ERROR_MESSAGES.CHILD_NOT_OWNED)
        );
      }

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Vaccination record retrieved successfully', { record })
      );

    } catch (error) {
      logger.error('Get vaccination record by ID error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Create vaccination record
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async createVaccinationRecord(req, res) {
    try {
      const recordData = req.body;
      const userId = req.user.userId;
      const userRole = req.user.role;

      // Verify child exists and check permissions
      const child = await Child.findById(recordData.child);
      if (!child) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, ERROR_MESSAGES.CHILD_NOT_FOUND)
        );
      }

      if (userRole === USER_ROLES.PARENT && child.parent.toString() !== userId) {
        return res.status(HTTP_STATUS.FORBIDDEN).json(
          createApiResponse(false, ERROR_MESSAGES.CHILD_NOT_OWNED)
        );
      }

      // Verify vaccine exists and is active
      const vaccine = await Vaccine.findById(recordData.vaccine);
      if (!vaccine || !vaccine.isActive) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, 'Vaccine not found or inactive')
        );
      }

      // Check for duplicate records
      const existingRecord = await VaccinationRecord.findOne({
        child: recordData.child,
        vaccine: recordData.vaccine,
        doseNumber: recordData.doseNumber,
        status: { $ne: VACCINATION_STATUS.CANCELLED }
      });

      if (existingRecord) {
        return res.status(HTTP_STATUS.CONFLICT).json(
          createApiResponse(false, 'Duplicate vaccination record exists')
        );
      }

      const record = new VaccinationRecord({
        ...recordData,
        createdBy: userId,
        status: recordData.status || VACCINATION_STATUS.SCHEDULED
      });

      await record.save();

      await record.populate([
        { path: 'child', select: 'firstName lastName' },
        { path: 'vaccine', select: 'name type' },
        { path: 'createdBy', select: 'firstName lastName' }
      ]);

      logger.info(`Vaccination record created: ${record._id} for child ${child.firstName} ${child.lastName}`);

      res.status(HTTP_STATUS.CREATED).json(
        createApiResponse(true, 'Vaccination record created successfully', { record })
      );

    } catch (error) {
      logger.error('Create vaccination record error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Update vaccination record
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async updateVaccinationRecord(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;
      const userId = req.user.userId;
      const userRole = req.user.role;

      const record = await VaccinationRecord.findById(id).populate('child');
      if (!record) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, ERROR_MESSAGES.VACCINATION_RECORD_NOT_FOUND)
        );
      }

      // Check permissions
      if (userRole === USER_ROLES.PARENT && record.child.parent.toString() !== userId) {
        return res.status(HTTP_STATUS.FORBIDDEN).json(
          createApiResponse(false, ERROR_MESSAGES.CHILD_NOT_OWNED)
        );
      }

      // Prevent updating completed vaccinations
      if (record.status === VACCINATION_STATUS.COMPLETED) {
        return res.status(HTTP_STATUS.FORBIDDEN).json(
          createApiResponse(false, 'Cannot update completed vaccination records')
        );
      }

      // Remove protected fields
      delete updates.child;
      delete updates.vaccine;
      delete updates.createdBy;
      delete updates.createdAt;

      const cleanedUpdates = removeEmptyFields(updates);
      cleanedUpdates.lastModifiedBy = userId;
      cleanedUpdates.lastModifiedAt = new Date();

      const updatedRecord = await VaccinationRecord.findByIdAndUpdate(
        id,
        { $set: cleanedUpdates },
        { new: true, runValidators: true }
      ).populate([
        { path: 'child', select: 'firstName lastName' },
        { path: 'vaccine', select: 'name type' }
      ]);

      logger.info(`Vaccination record updated: ${id} by user ${req.user.email}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Vaccination record updated successfully', { record: updatedRecord })
      );

    } catch (error) {
      logger.error('Update vaccination record error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Mark vaccination as completed
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async markVaccinationCompleted(req, res) {
    try {
      const { id } = req.params;
      const { 
        administeredDate, 
        administeredBy, 
        location, 
        batchNumber, 
        sideEffects, 
        notes 
      } = req.body;
      const userId = req.user.userId;

      const record = await VaccinationRecord.findById(id).populate('child vaccine');
      if (!record) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, ERROR_MESSAGES.VACCINATION_RECORD_NOT_FOUND)
        );
      }

      if (record.status === VACCINATION_STATUS.COMPLETED) {
        return res.status(HTTP_STATUS.CONFLICT).json(
          createApiResponse(false, ERROR_MESSAGES.VACCINATION_ALREADY_COMPLETED)
        );
      }

      // Update record
      record.status = VACCINATION_STATUS.COMPLETED;
      record.administeredDate = administeredDate ? new Date(administeredDate) : new Date();
      record.administeredBy = administeredBy;
      record.location = location;
      record.batchNumber = batchNumber;
      record.sideEffects = sideEffects || [];
      record.notes = notes || record.notes;
      record.completedBy = userId;
      record.completedAt = new Date();

      await record.save();

      logger.info(`Vaccination completed: ${record._id} - ${record.vaccine.name} for ${record.child.firstName} ${record.child.lastName}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Vaccination marked as completed successfully', { record })
      );

    } catch (error) {
      logger.error('Mark vaccination completed error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Reschedule vaccination
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async rescheduleVaccination(req, res) {
    try {
      const { id } = req.params;
      const { newScheduledDate, reason, notes } = req.body;
      const userId = req.user.userId;
      const userRole = req.user.role;

      const record = await VaccinationRecord.findById(id).populate('child');
      if (!record) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, ERROR_MESSAGES.VACCINATION_RECORD_NOT_FOUND)
        );
      }

      // Check permissions
      if (userRole === USER_ROLES.PARENT && record.child.parent.toString() !== userId) {
        return res.status(HTTP_STATUS.FORBIDDEN).json(
          createApiResponse(false, ERROR_MESSAGES.CHILD_NOT_OWNED)
        );
      }

      if (record.status === VACCINATION_STATUS.COMPLETED) {
        return res.status(HTTP_STATUS.CONFLICT).json(
          createApiResponse(false, 'Cannot reschedule completed vaccinations')
        );
      }

      // Store reschedule history
      const rescheduleEntry = {
        oldDate: record.scheduledDate,
        newDate: new Date(newScheduledDate),
        reason,
        rescheduledBy: userId,
        rescheduledAt: new Date()
      };

      record.rescheduleHistory = record.rescheduleHistory || [];
      record.rescheduleHistory.push(rescheduleEntry);

      // Update record
      record.scheduledDate = new Date(newScheduledDate);
      record.status = VACCINATION_STATUS.SCHEDULED;
      record.notes = notes || record.notes;
      record.lastModifiedBy = userId;
      record.lastModifiedAt = new Date();

      await record.save();

      logger.info(`Vaccination rescheduled: ${record._id} - New date: ${newScheduledDate}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Vaccination rescheduled successfully', { record })
      );

    } catch (error) {
      logger.error('Reschedule vaccination error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Cancel vaccination
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async cancelVaccination(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const userId = req.user.userId;
      const userRole = req.user.role;

      const record = await VaccinationRecord.findById(id).populate('child');
      if (!record) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, ERROR_MESSAGES.VACCINATION_RECORD_NOT_FOUND)
        );
      }

      // Check permissions
      if (userRole === USER_ROLES.PARENT && record.child.parent.toString() !== userId) {
        return res.status(HTTP_STATUS.FORBIDDEN).json(
          createApiResponse(false, ERROR_MESSAGES.CHILD_NOT_OWNED)
        );
      }

      if (record.status === VACCINATION_STATUS.COMPLETED) {
        return res.status(HTTP_STATUS.CONFLICT).json(
          createApiResponse(false, 'Cannot cancel completed vaccinations')
        );
      }

      // Update record
      record.status = VACCINATION_STATUS.CANCELLED;
      record.cancellationReason = reason;
      record.cancelledBy = userId;
      record.cancelledAt = new Date();

      await record.save();

      logger.info(`Vaccination cancelled: ${record._id} - Reason: ${reason}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Vaccination cancelled successfully', { record })
      );

    } catch (error) {
      logger.error('Cancel vaccination error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Get child vaccination records
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getChildVaccinationRecords(req, res) {
    try {
      const { childId } = req.params;
      const { status, vaccineId } = req.query;
      const userId = req.user.userId;
      const userRole = req.user.role;

      const child = await Child.findById(childId);
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

      let filter = { child: childId };
      if (status) filter.status = status;
      if (vaccineId) filter.vaccine = vaccineId;

      const records = await VaccinationRecord.find(filter)
        .populate('vaccine', 'name type manufacturer')
        .sort({ scheduledDate: 1 });

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Child vaccination records retrieved successfully', { 
          records,
          child: { _id: child._id, name: `${child.firstName} ${child.lastName}` },
          total: records.length
        })
      );

    } catch (error) {
      logger.error('Get child vaccination records error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Get upcoming vaccinations
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getUpcomingVaccinations(req, res) {
    try {
      const { days = 30, childId } = req.query;
      const userId = req.user.userId;
      const userRole = req.user.role;

      const futureDate = new Date(Date.now() + (parseInt(days) * 24 * 60 * 60 * 1000));

      let filter = {
        status: VACCINATION_STATUS.SCHEDULED,
        scheduledDate: {
          $gte: new Date(),
          $lte: futureDate
        }
      };

      // Apply permission filtering
      if (userRole === USER_ROLES.PARENT) {
        const children = await Child.find({ parent: userId }).select('_id');
        filter.child = { $in: children.map(child => child._id) };
      }

      if (childId) {
        filter.child = childId;
      }

      const records = await VaccinationRecord.find(filter)
        .populate('child', 'firstName lastName')
        .populate('vaccine', 'name type')
        .sort({ scheduledDate: 1 });

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Upcoming vaccinations retrieved successfully', {
          records,
          total: records.length,
          daysAhead: parseInt(days)
        })
      );

    } catch (error) {
      logger.error('Get upcoming vaccinations error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Get overdue vaccinations
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getOverdueVaccinations(req, res) {
    try {
      const { childId, gracePeriod = 0 } = req.query;
      const userId = req.user.userId;
      const userRole = req.user.role;

      const overdueDate = new Date(Date.now() - (parseInt(gracePeriod) * 24 * 60 * 60 * 1000));

      let filter = {
        status: { $in: [VACCINATION_STATUS.SCHEDULED, VACCINATION_STATUS.OVERDUE] },
        scheduledDate: { $lt: overdueDate }
      };

      // Apply permission filtering
      if (userRole === USER_ROLES.PARENT) {
        const children = await Child.find({ parent: userId }).select('_id');
        filter.child = { $in: children.map(child => child._id) };
      }

      if (childId) {
        filter.child = childId;
      }

      const records = await VaccinationRecord.find(filter)
        .populate('child', 'firstName lastName')
        .populate('vaccine', 'name type')
        .sort({ scheduledDate: 1 });

      // Calculate days overdue for each record
      const recordsWithOverdueDays = records.map(record => ({
        ...record.toObject(),
        daysOverdue: Math.ceil((new Date() - record.scheduledDate) / (1000 * 60 * 60 * 24))
      }));

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Overdue vaccinations retrieved successfully', {
          records: recordsWithOverdueDays,
          total: recordsWithOverdueDays.length,
          gracePeriod: parseInt(gracePeriod)
        })
      );

    } catch (error) {
      logger.error('Get overdue vaccinations error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Mark vaccination as missed
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async markVaccinationMissed(req, res) {
    try {
      const { id } = req.params;
      const { reason, notes } = req.body;
      const userId = req.user.userId;

      const record = await VaccinationRecord.findById(id).populate('child');
      if (!record) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, ERROR_MESSAGES.VACCINATION_RECORD_NOT_FOUND)
        );
      }

      if (record.status === VACCINATION_STATUS.COMPLETED) {
        return res.status(HTTP_STATUS.CONFLICT).json(
          createApiResponse(false, ERROR_MESSAGES.VACCINATION_ALREADY_COMPLETED)
        );
      }

      // Update record
      record.status = VACCINATION_STATUS.MISSED;
      record.missedReason = reason;
      record.notes = notes || record.notes;
      record.missedBy = userId;
      record.missedAt = new Date();

      await record.save();

      logger.info(`Vaccination marked as missed: ${record._id} - Reason: ${reason}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Vaccination marked as missed successfully', { record })
      );

    } catch (error) {
      logger.error('Mark vaccination missed error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Delete vaccination record
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async deleteVaccinationRecord(req, res) {
    try {
      const { id } = req.params;

      const record = await VaccinationRecord.findById(id);
      if (!record) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, ERROR_MESSAGES.VACCINATION_RECORD_NOT_FOUND)
        );
      }

      // Don't delete completed vaccinations
      if (record.status === VACCINATION_STATUS.COMPLETED) {
        return res.status(HTTP_STATUS.FORBIDDEN).json(
          createApiResponse(false, 'Cannot delete completed vaccination records')
        );
      }

      await VaccinationRecord.findByIdAndDelete(id);

      logger.info(`Vaccination record deleted: ${id} by admin ${req.user.email}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Vaccination record deleted successfully')
      );

    } catch (error) {
      logger.error('Delete vaccination record error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Get vaccination statistics
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getVaccinationStatistics(req, res) {
    try {
      const { childId, parentId, startDate, endDate } = req.query;
      const userId = req.user.userId;
      const userRole = req.user.role;

      // Build filter based on permissions
      let filter = {};

      if (childId) {
        const child = await Child.findById(childId);
        if (!child) {
          return res.status(HTTP_STATUS.NOT_FOUND).json(
            createApiResponse(false, ERROR_MESSAGES.CHILD_NOT_FOUND)
          );
        }

        if (userRole === USER_ROLES.PARENT && child.parent.toString() !== userId) {
          return res.status(HTTP_STATUS.FORBIDDEN).json(
            createApiResponse(false, ERROR_MESSAGES.CHILD_NOT_OWNED)
          );
        }

        filter.child = childId;
      } else if (parentId && (userRole === USER_ROLES.ADMIN || userRole === USER_ROLES.DOCTOR)) {
        const children = await Child.find({ parent: parentId }).select('_id');
        filter.child = { $in: children.map(child => child._id) };
      } else if (userRole === USER_ROLES.PARENT) {
        const children = await Child.find({ parent: userId }).select('_id');
        filter.child = { $in: children.map(child => child._id) };
      }

      if (startDate && endDate) {
        filter.scheduledDate = {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        };
      }

      // Get status statistics
      const statusStats = await VaccinationRecord.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      // Get vaccine statistics
      const vaccineStats = await VaccinationRecord.aggregate([
        { $match: filter },
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
          $group: {
            _id: '$vaccineInfo.name',
            total: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }
          }
        },
        { $sort: { total: -1 } },
        { $limit: 10 }
      ]);

      // Get monthly trends
      const monthlyTrends = await VaccinationRecord.aggregate([
        { 
          $match: {
            ...filter,
            scheduledDate: {
              $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) // Last year
            }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$scheduledDate' },
              month: { $month: '$scheduledDate' },
              status: '$status'
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]);

      const statistics = {
        overview: {
          total: statusStats.reduce((sum, stat) => sum + stat.count, 0),
          byStatus: statusStats.reduce((acc, stat) => {
            acc[stat._id] = stat.count;
            return acc;
          }, {}),
          completionRate: statusStats.length > 0 ? 
            Math.round(((statusStats.find(s => s._id === 'completed')?.count || 0) / 
                       statusStats.reduce((sum, stat) => sum + stat.count, 0)) * 100) : 0
        },
        topVaccines: vaccineStats,
        monthlyTrends,
        dateRange: {
          startDate: startDate || 'All time',
          endDate: endDate || 'Present'
        }
      };

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Vaccination statistics retrieved successfully', { statistics })
      );

    } catch (error) {
      logger.error('Get vaccination statistics error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Get vaccination calendar for specific month
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getVaccinationCalendar(req, res) {
    try {
      const { year, month } = req.params;
      const { childId } = req.query;
      const userId = req.user.userId;
      const userRole = req.user.role;

      // Build date range for the month
      const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59, 999);

      let filter = {
        scheduledDate: {
          $gte: startDate,
          $lte: endDate
        }
      };

      if (childId) {
        const child = await Child.findById(childId);
        if (!child) {
          return res.status(HTTP_STATUS.NOT_FOUND).json(
            createApiResponse(false, ERROR_MESSAGES.CHILD_NOT_FOUND)
          );
        }

        if (userRole === USER_ROLES.PARENT && child.parent.toString() !== userId) {
          return res.status(HTTP_STATUS.FORBIDDEN).json(
            createApiResponse(false, ERROR_MESSAGES.CHILD_NOT_OWNED)
          );
        }

        filter.child = childId;
      } else if (userRole === USER_ROLES.PARENT) {
        const children = await Child.find({ parent: userId }).select('_id');
        filter.child = { $in: children.map(child => child._id) };
      }

      const calendarData = await VaccinationRecord.find(filter)
        .populate('child', 'firstName lastName')
        .populate('vaccine', 'name type')
        .sort({ scheduledDate: 1 });

      // Group by date
      const groupedByDate = calendarData.reduce((acc, record) => {
        const dateKey = record.scheduledDate.toISOString().split('T')[0];
        if (!acc[dateKey]) {
          acc[dateKey] = [];
        }
        acc[dateKey].push({
          _id: record._id,
          child: record.child,
          vaccine: record.vaccine,
          status: record.status,
          doseNumber: record.doseNumber,
          scheduledTime: record.scheduledDate.toISOString()
        });
        return acc;
      }, {});

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(
          true,
          'Vaccination calendar retrieved successfully',
          {
            year: parseInt(year),
            month: parseInt(month),
            calendarData: groupedByDate,
            totalRecords: calendarData.length
          }
        )
      );

    } catch (error) {
      logger.error('Get vaccination calendar error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Bulk schedule vaccinations
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async bulkScheduleVaccinations(req, res) {
    try {
      const { childId, vaccinations } = req.body;
      const userId = req.user.userId;
      const userRole = req.user.role;

      // Verify child
      const child = await Child.findById(childId);
      if (!child) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, ERROR_MESSAGES.CHILD_NOT_FOUND)
        );
      }

      if (userRole === USER_ROLES.PARENT && child.parent.toString() !== userId) {
        return res.status(HTTP_STATUS.FORBIDDEN).json(
          createApiResponse(false, ERROR_MESSAGES.CHILD_NOT_OWNED)
        );
      }

      const results = [];
      const errors = [];

      for (let i = 0; i < vaccinations.length; i++) {
        try {
          const vaccinationData = {
            ...vaccinations[i],
            child: childId,
            status: VACCINATION_STATUS.SCHEDULED,
            createdBy: userId
          };

          // Check if vaccine exists
          const vaccine = await Vaccine.findById(vaccinationData.vaccine);
          if (!vaccine || !vaccine.isActive) {
            errors.push({
              index: i,
              error: 'Vaccine not found or inactive'
            });
            continue;
          }

          // Check for duplicates
          const existingRecord = await VaccinationRecord.findOne({
            child: childId,
            vaccine: vaccinationData.vaccine,
            doseNumber: vaccinationData.doseNumber,
            scheduledDate: {
              $gte: new Date(vaccinationData.scheduledDate).setHours(0, 0, 0, 0),
              $lt: new Date(vaccinationData.scheduledDate).setHours(23, 59, 59, 999)
            }
          });

          if (existingRecord) {
            errors.push({
              index: i,
              error: 'Duplicate vaccination record'
            });
            continue;
          }

          const record = new VaccinationRecord(vaccinationData);
          await record.save();
          await record.populate([
            { path: 'vaccine', select: 'name type' }
          ]);

          results.push(record);

        } catch (error) {
          errors.push({
            index: i,
            error: error.message
          });
        }
      }

      logger.info(`Bulk vaccination scheduling: ${results.length} successful, ${errors.length} failed`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(
          true,
          `Bulk scheduling completed: ${results.length} successful, ${errors.length} failed`,
          {
            successful: results,
            errors,
            totalProcessed: vaccinations.length,
            successCount: results.length,
            errorCount: errors.length
          }
        )
      );

    } catch (error) {
      logger.error('Bulk schedule vaccinations error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Add side effects to completed vaccination
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async addSideEffects(req, res) {
    try {
      const { id } = req.params;
      const { sideEffects, severity, notes, reportedDate } = req.body;
      const userId = req.user.userId;
      const userRole = req.user.role;

      const record = await VaccinationRecord.findById(id).populate('child');
      if (!record) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, ERROR_MESSAGES.VACCINATION_RECORD_NOT_FOUND)
        );
      }

      // Check permissions
      if (userRole === USER_ROLES.PARENT && record.child.parent.toString() !== userId) {
        return res.status(HTTP_STATUS.FORBIDDEN).json(
          createApiResponse(false, ERROR_MESSAGES.CHILD_NOT_OWNED)
        );
      }

      if (record.status !== VACCINATION_STATUS.COMPLETED) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json(
          createApiResponse(false, 'Can only add side effects to completed vaccinations')
        );
      }

      // Add side effects data
      const sideEffectEntry = {
        effects: sideEffects,
        severity: severity || 'mild',
        notes,
        reportedDate: reportedDate ? new Date(reportedDate) : new Date(),
        reportedBy: userId
      };

      record.sideEffectsReports = record.sideEffectsReports || [];
      record.sideEffectsReports.push(sideEffectEntry);

      // Update main sideEffects array
      const newEffects = sideEffects.filter(effect => !record.sideEffects.includes(effect));
      record.sideEffects.push(...newEffects);

      await record.save();

      logger.info(`Side effects added to vaccination record: ${id}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Side effects added successfully', { 
          record,
          addedEffects: sideEffectEntry
        })
      );

    } catch (error) {
      logger.error('Add side effects error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Export child vaccination records
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async exportChildVaccinationRecords(req, res) {
    try {
      const { childId } = req.params;
      const { format = 'json', includeCompleted = true, includeScheduled = true } = req.query;
      const userId = req.user.userId;
      const userRole = req.user.role;

      const child = await Child.findById(childId);
      if (!child) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, ERROR_MESSAGES.CHILD_NOT_FOUND)
        );
      }

      if (userRole === USER_ROLES.PARENT && child.parent.toString() !== userId) {
        return res.status(HTTP_STATUS.FORBIDDEN).json(
          createApiResponse(false, ERROR_MESSAGES.CHILD_NOT_OWNED)
        );
      }

      let statusFilter = [];
      if (includeCompleted === 'true') statusFilter.push(VACCINATION_STATUS.COMPLETED);
      if (includeScheduled === 'true') statusFilter.push(VACCINATION_STATUS.SCHEDULED);

      const records = await VaccinationRecord.find({
        child: childId,
        status: { $in: statusFilter }
      })
      .populate('vaccine', 'name type manufacturer')
      .sort({ scheduledDate: 1 });

      if (format === 'csv') {
        const csv = this.convertRecordsToCSV(records, child);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${child.firstName}_${child.lastName}_vaccinations.csv"`);
        return res.send(csv);
      }

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(
          true,
          'Vaccination records exported successfully',
          {
            child: {
              _id: child._id,
              name: `${child.firstName} ${child.lastName}`,
              dateOfBirth: child.dateOfBirth
            },
            records,
            total: records.length,
            exportedAt: new Date()
          }
        )
      );

    } catch (error) {
      logger.error('Export child vaccination records error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Convert vaccination records to CSV format
   * @private
   * @param {Array} records - Vaccination records
   * @param {Object} child - Child object
   * @returns {String} CSV string
   */
  convertRecordsToCSV(records, child) {
    const headers = [
      'Child Name', 'Date of Birth', 'Vaccine Name', 'Vaccine Type', 'Dose Number',
      'Scheduled Date', 'Status', 'Administered Date', 'Administered By', 'Location',
      'Batch Number', 'Side Effects', 'Notes'
    ];

    const rows = records.map(record => [
      `${child.firstName} ${child.lastName}`,
      child.dateOfBirth.toISOString().split('T')[0],
      record.vaccine.name,
      record.vaccine.type,
      record.doseNumber,
      record.scheduledDate.toISOString().split('T')[0],
      record.status,
      record.administeredDate ? record.administeredDate.toISOString().split('T')[0] : '',
      record.administeredBy || '',
      record.location || '',
      record.batchNumber || '',
      record.sideEffects ? record.sideEffects.join('; ') : '',
      record.notes || ''
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');

    return csvContent;
  }

  /**
   * Get vaccination record history/audit trail
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getVaccinationRecordHistory(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.userId;
      const userRole = req.user.role;

      const record = await VaccinationRecord.findById(id)
        .populate('child')
        .populate('createdBy', 'firstName lastName')
        .populate('lastModifiedBy', 'firstName lastName')
        .populate('completedBy', 'firstName lastName');

      if (!record) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(
          createApiResponse(false, ERROR_MESSAGES.VACCINATION_RECORD_NOT_FOUND)
        );
      }

      if (userRole === USER_ROLES.PARENT && record.child.parent.toString() !== userId) {
        return res.status(HTTP_STATUS.FORBIDDEN).json(
          createApiResponse(false, ERROR_MESSAGES.CHILD_NOT_OWNED)
        );
      }

      const history = {
        recordId: record._id,
        currentStatus: record.status,
        createdBy: record.createdBy,
        createdAt: record.createdAt,
        lastModifiedBy: record.lastModifiedBy,
        lastModifiedAt: record.lastModifiedAt,
        completedBy: record.completedBy,
        completedAt: record.completedAt,
        rescheduleHistory: record.rescheduleHistory || [],
        sideEffectsReports: record.sideEffectsReports || []
      };

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Vaccination record history retrieved successfully', { history })
      );

    } catch (error) {
      logger.error('Get vaccination record history error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Batch update vaccination record statuses
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async batchUpdateStatus(req, res) {
    try {
      const { recordIds, status, reason, notes } = req.body;
      const userId = req.user.userId;

      const results = [];
      const errors = [];

      for (const recordId of recordIds) {
        try {
          const record = await VaccinationRecord.findById(recordId);
          if (!record) {
            errors.push({ recordId, error: 'Record not found' });
            continue;
          }

          if (record.status === VACCINATION_STATUS.COMPLETED && status !== VACCINATION_STATUS.COMPLETED) {
            errors.push({ recordId, error: 'Cannot change status of completed vaccination' });
            continue;
          }

          const oldStatus = record.status;
          record.status = status;
          record.lastModifiedBy = userId;
          record.lastModifiedAt = new Date();

          if (reason) {
            switch (status) {
              case VACCINATION_STATUS.CANCELLED:
                record.cancellationReason = reason;
                record.cancelledBy = userId;
                record.cancelledAt = new Date();
                break;
              case VACCINATION_STATUS.MISSED:
                record.missedReason = reason;
                record.missedBy = userId;
                record.missedAt = new Date();
                break;
            }
          }

          if (notes) {
            record.notes = notes;
          }

          await record.save();
          results.push({ recordId, oldStatus, newStatus: status });

        } catch (error) {
          errors.push({ recordId, error: error.message });
        }
      }

      logger.info(`Batch status update: ${results.length} successful, ${errors.length} failed`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(
          true,
          `Batch update completed: ${results.length} successful, ${errors.length} failed`,
          {
            successful: results,
            errors,
            totalProcessed: recordIds.length
          }
        )
      );

    } catch (error) {
      logger.error('Batch update status error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Generate vaccination reminders
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async generateReminders(req, res) {
    try {
      const { type, daysAhead = 7, childId, deliveryMethods } = req.body;

      let filter = {};

      if (type === 'upcoming') {
        const futureDate = new Date(Date.now() + (daysAhead * 24 * 60 * 60 * 1000));
        filter = {
          status: VACCINATION_STATUS.SCHEDULED,
          scheduledDate: {
            $gte: new Date(),
            $lte: futureDate
          }
        };
      } else if (type === 'overdue') {
        filter = {
          status: { $in: [VACCINATION_STATUS.SCHEDULED, VACCINATION_STATUS.OVERDUE] },
          scheduledDate: { $lt: new Date() }
        };
      }

      if (childId) {
        filter.child = childId;
      }

      const records = await VaccinationRecord.find(filter)
        .populate('child')
        .populate('vaccine', 'name');

      const reminderResults = [];

      for (const record of records) {
        try {
          let notification;
          if (type === 'upcoming') {
            notification = await notificationService.createVaccinationReminder(record._id, daysAhead);
          } else if (type === 'overdue') {
            notification = await notificationService.createOverdueNotification(record._id);
          }

          if (notification) {
            await notificationService.sendNotification(notification._id);
            reminderResults.push({
              recordId: record._id,
              childName: `${record.child.firstName} ${record.child.lastName}`,
              vaccineName: record.vaccine.name,
              success: true
            });
          }

        } catch (error) {
          reminderResults.push({
            recordId: record._id,
            success: false,
            error: error.message
          });
        }
      }

      const successCount = reminderResults.filter(r => r.success).length;

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(
          true,
          `Reminders generated: ${successCount}/${reminderResults.length} successful`,
          {
            results: reminderResults,
            totalProcessed: reminderResults.length,
            successCount,
            type,
            daysAhead
          }
        )
      );

    } catch (error) {
      logger.error('Generate reminders error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }

  /**
   * Get compliance report
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getComplianceReport(req, res) {
    try {
      const { startDate, endDate, ageGroup, vaccineId } = req.query;

      let childFilter = {};
      let recordFilter = {};

      // Age group filter
      if (ageGroup) {
        const [minAge, maxAge] = ageGroup.split('-').map(Number);
        const now = new Date();
        const minDate = new Date(now.getFullYear() - maxAge, now.getMonth(), now.getDate());
        const maxDate = new Date(now.getFullYear() - minAge, now.getMonth(), now.getDate());
        
        childFilter.dateOfBirth = { $gte: minDate, $lte: maxDate };
      }

      if (vaccineId) {
        recordFilter.vaccine = vaccineId;
      }

      if (startDate && endDate) {
        recordFilter.scheduledDate = {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        };
      }

      // Get children matching criteria
      const children = await Child.find(childFilter);
      const childIds = children.map(child => child._id);
      recordFilter.child = { $in: childIds };

      // Get compliance statistics
      const complianceStats = await VaccinationRecord.aggregate([
        { $match: recordFilter },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      // Calculate compliance rate
      const totalRecords = complianceStats.reduce((sum, stat) => sum + stat.count, 0);
      const completedCount = complianceStats.find(s => s._id === 'completed')?.count || 0;
      const complianceRate = totalRecords > 0 ? Math.round((completedCount / totalRecords) * 100) : 0;

      const report = {
        reportGenerated: new Date(),
        filters: {
          startDate: startDate || 'All time',
          endDate: endDate || 'Present',
          ageGroup: ageGroup || 'All ages',
          vaccineId: vaccineId || 'All vaccines'
        },
        summary: {
          totalChildren: children.length,
          totalRecords,
          complianceRate,
          statusBreakdown: complianceStats.reduce((acc, stat) => {
            acc[stat._id] = {
              count: stat.count,
              percentage: Math.round((stat.count / totalRecords) * 100)
            };
            return acc;
          }, {})
        }
      };

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Compliance report generated successfully', { report })
      );

    } catch (error) {
      logger.error('Get compliance report error:', error);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(
        createApiResponse(false, ERROR_MESSAGES.INTERNAL_ERROR)
      );
    }
  }
}

module.exports = new VaccinationRecordController();