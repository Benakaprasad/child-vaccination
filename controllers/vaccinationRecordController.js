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
const { logger } = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');

class VaccinationRecordController {
  /**
   * Get vaccination records with filtering and pagination
   */
  async getVaccinationRecords(req, res, next) {
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
      
      const userId = req.user._id || req.user.userId;
      const userRole = req.user.role;

      // Validate pagination parameters
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(50, Math.max(1, parseInt(limit)));

      let filter = {};

      // Apply permission-based filtering
      if (userRole === USER_ROLES.PARENT) {
        const children = await Child.find({ parent: userId }).select('_id');
        filter.child = { $in: children.map(child => child._id) };
      }

      // Apply additional filters with validation
      if (childId) {
        if (!childId.match(/^[0-9a-fA-F]{24}$/)) {
          throw new AppError('Invalid child ID format', 400);
        }
        filter.child = childId;
      }
      
      if (vaccineId) {
        if (!vaccineId.match(/^[0-9a-fA-F]{24}$/)) {
          throw new AppError('Invalid vaccine ID format', 400);
        }
        filter.vaccine = vaccineId;
      }
      
      if (status && Object.values(VACCINATION_STATUS).includes(status)) {
        filter.status = status;
      }
      
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          throw new AppError('Invalid date format', 400);
        }
        
        if (start > end) {
          throw new AppError('Start date cannot be after end date', 400);
        }
        
        filter.scheduledDate = {
          $gte: start,
          $lte: end
        };
      }

      const query = VaccinationRecord.find(filter)
        .populate('child', 'firstName lastName dateOfBirth')
        .populate('vaccine', 'name type manufacturer');

      const result = await paginateResults(
        query,
        pageNum,
        limitNum,
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
      next(error);
    }
  }

  /**
   * Get a specific vaccination record by ID
   */
  async getVaccinationRecordById(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user._id || req.user.userId;
      const userRole = req.user.role;

      // Validate MongoDB ObjectId format
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new AppError('Invalid vaccination record ID format', 400);
      }

      const record = await VaccinationRecord.findById(id)
        .populate('child', 'firstName lastName dateOfBirth parent')
        .populate('vaccine', 'name type manufacturer schedule sideEffects')
        .populate('createdBy', 'firstName lastName')
        .populate('completedBy', 'firstName lastName');

      if (!record) {
        throw new AppError(ERROR_MESSAGES.VACCINATION_RECORD_NOT_FOUND || 'Vaccination record not found', 404);
      }

      // Check permissions
      if (userRole === USER_ROLES.PARENT && record.child.parent.toString() !== userId.toString()) {
        throw new AppError(ERROR_MESSAGES.CHILD_NOT_OWNED || 'Access denied', 403);
      }

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Vaccination record retrieved successfully', { record })
      );

    } catch (error) {
      logger.error('Get vaccination record by ID error:', error);
      next(error);
    }
  }

  /**
   * Create a new vaccination record
   */
  async createVaccinationRecord(req, res, next) {
    try {
      const recordData = req.body;
      const userId = req.user._id || req.user.userId;
      const userRole = req.user.role;

      // Validate required fields
      const requiredFields = ['child', 'vaccine', 'scheduledDate', 'doseNumber'];
      const missingFields = requiredFields.filter(field => !recordData[field]);
      
      if (missingFields.length > 0) {
        throw new AppError(`Missing required fields: ${missingFields.join(', ')}`, 400);
      }

      // Validate ObjectId formats
      if (!recordData.child.match(/^[0-9a-fA-F]{24}$/)) {
        throw new AppError('Invalid child ID format', 400);
      }
      
      if (!recordData.vaccine.match(/^[0-9a-fA-F]{24}$/)) {
        throw new AppError('Invalid vaccine ID format', 400);
      }

      // Verify child exists and check permissions
      const child = await Child.findById(recordData.child);
      if (!child) {
        throw new AppError(ERROR_MESSAGES.CHILD_NOT_FOUND || 'Child not found', 404);
      }

      if (userRole === USER_ROLES.PARENT && child.parent.toString() !== userId.toString()) {
        throw new AppError(ERROR_MESSAGES.CHILD_NOT_OWNED || 'Access denied', 403);
      }

      // Verify vaccine exists and is active
      const vaccine = await Vaccine.findById(recordData.vaccine);
      if (!vaccine || !vaccine.isActive) {
        throw new AppError('Vaccine not found or inactive', 404);
      }

      // Check for duplicate records
      const existingRecord = await VaccinationRecord.findOne({
        child: recordData.child,
        vaccine: recordData.vaccine,
        doseNumber: recordData.doseNumber,
        status: { $ne: VACCINATION_STATUS.CANCELLED }
      });

      if (existingRecord) {
        throw new AppError('Duplicate vaccination record exists', 409);
      }

      // Validate scheduled date
      const scheduledDate = new Date(recordData.scheduledDate);
      if (isNaN(scheduledDate.getTime())) {
        throw new AppError('Invalid scheduled date format', 400);
      }

      const record = new VaccinationRecord({
        ...recordData,
        scheduledDate,
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
      next(error);
    }
  }

  /**
   * Update a vaccination record
   */
  async updateVaccinationRecord(req, res, next) {
    try {
      const { id } = req.params;
      const updates = req.body;
      const userId = req.user._id || req.user.userId;
      const userRole = req.user.role;

      // Validate MongoDB ObjectId format
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new AppError('Invalid vaccination record ID format', 400);
      }

      const record = await VaccinationRecord.findById(id).populate('child');
      if (!record) {
        throw new AppError(ERROR_MESSAGES.VACCINATION_RECORD_NOT_FOUND || 'Vaccination record not found', 404);
      }

      // Check permissions
      if (userRole === USER_ROLES.PARENT && record.child.parent.toString() !== userId.toString()) {
        throw new AppError(ERROR_MESSAGES.CHILD_NOT_OWNED || 'Access denied', 403);
      }

      // Prevent updating completed vaccinations
      if (record.status === VACCINATION_STATUS.COMPLETED) {
        throw new AppError('Cannot update completed vaccination records', 403);
      }

      // Remove protected fields
      const protectedFields = ['child', 'vaccine', 'createdBy', 'createdAt'];
      protectedFields.forEach(field => delete updates[field]);

      // Validate scheduled date if provided
      if (updates.scheduledDate) {
        const scheduledDate = new Date(updates.scheduledDate);
        if (isNaN(scheduledDate.getTime())) {
          throw new AppError('Invalid scheduled date format', 400);
        }
        updates.scheduledDate = scheduledDate;
      }

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

      logger.info(`Vaccination record updated: ${id} by user ${req.user.email || userId}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Vaccination record updated successfully', { record: updatedRecord })
      );

    } catch (error) {
      logger.error('Update vaccination record error:', error);
      next(error);
    }
  }

  /**
   * Mark vaccination as completed
   */
  async markVaccinationCompleted(req, res, next) {
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
      const userId = req.user._id || req.user.userId;

      // Validate MongoDB ObjectId format
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new AppError('Invalid vaccination record ID format', 400);
      }

      const record = await VaccinationRecord.findById(id).populate('child vaccine');
      if (!record) {
        throw new AppError(ERROR_MESSAGES.VACCINATION_RECORD_NOT_FOUND || 'Vaccination record not found', 404);
      }

      if (record.status === VACCINATION_STATUS.COMPLETED) {
        throw new AppError(ERROR_MESSAGES.VACCINATION_ALREADY_COMPLETED || 'Vaccination already completed', 409);
      }

      // Validate administered date if provided
      let adminDate = new Date();
      if (administeredDate) {
        adminDate = new Date(administeredDate);
        if (isNaN(adminDate.getTime())) {
          throw new AppError('Invalid administered date format', 400);
        }
      }

      // Update record
      record.status = VACCINATION_STATUS.COMPLETED;
      record.administeredDate = adminDate;
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
      next(error);
    }
  }

  /**
   * Reschedule a vaccination
   */
  async rescheduleVaccination(req, res, next) {
    try {
      const { id } = req.params;
      const { newScheduledDate, reason, notes } = req.body;
      const userId = req.user._id || req.user.userId;
      const userRole = req.user.role;

      // Validate MongoDB ObjectId format
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new AppError('Invalid vaccination record ID format', 400);
      }

      // Validate required fields
      if (!newScheduledDate) {
        throw new AppError('New scheduled date is required', 400);
      }

      // Validate new date
      const newDate = new Date(newScheduledDate);
      if (isNaN(newDate.getTime())) {
        throw new AppError('Invalid new scheduled date format', 400);
      }

      const record = await VaccinationRecord.findById(id).populate('child');
      if (!record) {
        throw new AppError(ERROR_MESSAGES.VACCINATION_RECORD_NOT_FOUND || 'Vaccination record not found', 404);
      }

      // Check permissions
      if (userRole === USER_ROLES.PARENT && record.child.parent.toString() !== userId.toString()) {
        throw new AppError(ERROR_MESSAGES.CHILD_NOT_OWNED || 'Access denied', 403);
      }

      if (record.status === VACCINATION_STATUS.COMPLETED) {
        throw new AppError('Cannot reschedule completed vaccinations', 403);
      }

      // Store reschedule history
      const rescheduleEntry = {
        oldDate: record.scheduledDate,
        newDate: newDate,
        reason,
        rescheduledBy: userId,
        rescheduledAt: new Date()
      };

      record.rescheduleHistory = record.rescheduleHistory || [];
      record.rescheduleHistory.push(rescheduleEntry);

      // Update record
      record.scheduledDate = newDate;
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
      next(error);
    }
  }

  /**
   * Cancel a vaccination
   */
  async cancelVaccination(req, res, next) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const userId = req.user._id || req.user.userId;
      const userRole = req.user.role;

      // Validate MongoDB ObjectId format
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new AppError('Invalid vaccination record ID format', 400);
      }

      if (!reason) {
        throw new AppError('Cancellation reason is required', 400);
      }

      const record = await VaccinationRecord.findById(id).populate('child');
      if (!record) {
        throw new AppError(ERROR_MESSAGES.VACCINATION_RECORD_NOT_FOUND || 'Vaccination record not found', 404);
      }

      // Check permissions
      if (userRole === USER_ROLES.PARENT && record.child.parent.toString() !== userId.toString()) {
        throw new AppError(ERROR_MESSAGES.CHILD_NOT_OWNED || 'Access denied', 403);
      }

      if (record.status === VACCINATION_STATUS.COMPLETED) {
        throw new AppError('Cannot cancel completed vaccinations', 403);
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
      next(error);
    }
  }

  /**
   * Get vaccination records for a specific child
   */
  async getChildVaccinationRecords(req, res, next) {
    try {
      const { childId } = req.params;
      const { status, vaccineId } = req.query;
      const userId = req.user._id || req.user.userId;
      const userRole = req.user.role;

      // Validate MongoDB ObjectId format
      if (!childId.match(/^[0-9a-fA-F]{24}$/)) {
        throw new AppError('Invalid child ID format', 400);
      }

      const child = await Child.findById(childId);
      if (!child) {
        throw new AppError(ERROR_MESSAGES.CHILD_NOT_FOUND || 'Child not found', 404);
      }

      // Check permissions
      if (userRole === USER_ROLES.PARENT && child.parent.toString() !== userId.toString()) {
        throw new AppError(ERROR_MESSAGES.CHILD_NOT_OWNED || 'Access denied', 403);
      }

      let filter = { child: childId };
      
      if (status && Object.values(VACCINATION_STATUS).includes(status)) {
        filter.status = status;
      }
      
      if (vaccineId) {
        if (!vaccineId.match(/^[0-9a-fA-F]{24}$/)) {
          throw new AppError('Invalid vaccine ID format', 400);
        }
        filter.vaccine = vaccineId;
      }

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
      next(error);
    }
  }

  /**
   * Get upcoming vaccinations
   */
  async getUpcomingVaccinations(req, res, next) {
    try {
      const { days = 30, childId } = req.query;
      const userId = req.user._id || req.user.userId;
      const userRole = req.user.role;

      // Validate and sanitize inputs
      const daysNum = Math.min(365, Math.max(1, parseInt(days)));
      const futureDate = new Date(Date.now() + (daysNum * 24 * 60 * 60 * 1000));

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
        if (!childId.match(/^[0-9a-fA-F]{24}$/)) {
          throw new AppError('Invalid child ID format', 400);
        }
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
          daysAhead: daysNum
        })
      );

    } catch (error) {
      logger.error('Get upcoming vaccinations error:', error);
      next(error);
    }
  }

  /**
   * Get overdue vaccinations
   */
  async getOverdueVaccinations(req, res, next) {
    try {
      const { childId, gracePeriod = 0 } = req.query;
      const userId = req.user._id || req.user.userId;
      const userRole = req.user.role;

      // Validate and sanitize inputs
      const gracePeriodNum = Math.max(0, parseInt(gracePeriod));
      const overdueDate = new Date(Date.now() - (gracePeriodNum * 24 * 60 * 60 * 1000));

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
        if (!childId.match(/^[0-9a-fA-F]{24}$/)) {
          throw new AppError('Invalid child ID format', 400);
        }
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
          gracePeriod: gracePeriodNum
        })
      );

    } catch (error) {
      logger.error('Get overdue vaccinations error:', error);
      next(error);
    }
  }

  /**
   * Mark vaccination as missed
   */
  async markVaccinationMissed(req, res, next) {
    try {
      const { id } = req.params;
      const { reason, notes } = req.body;
      const userId = req.user._id || req.user.userId;

      // Validate MongoDB ObjectId format
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new AppError('Invalid vaccination record ID format', 400);
      }

      if (!reason) {
        throw new AppError('Reason for missing vaccination is required', 400);
      }

      const record = await VaccinationRecord.findById(id).populate('child');
      if (!record) {
        throw new AppError(ERROR_MESSAGES.VACCINATION_RECORD_NOT_FOUND || 'Vaccination record not found', 404);
      }

      if (record.status === VACCINATION_STATUS.COMPLETED) {
        throw new AppError(ERROR_MESSAGES.VACCINATION_ALREADY_COMPLETED || 'Vaccination already completed', 409);
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
      next(error);
    }
  }

  /**
   * Delete a vaccination record (Admin only, non-completed records)
   */
  async deleteVaccinationRecord(req, res, next) {
    try {
      const { id } = req.params;
      const userRole = req.user.role;
      const userId = req.user._id || req.user.userId;

      // Only admins can delete vaccination records
      if (userRole !== USER_ROLES.ADMIN) {
        throw new AppError(ERROR_MESSAGES.ACCESS_DENIED || 'Access denied', 403);
      }

      // Validate MongoDB ObjectId format
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new AppError('Invalid vaccination record ID format', 400);
      }

      const record = await VaccinationRecord.findById(id);
      if (!record) {
        throw new AppError(ERROR_MESSAGES.VACCINATION_RECORD_NOT_FOUND || 'Vaccination record not found', 404);
      }

      // Don't delete completed vaccinations
      if (record.status === VACCINATION_STATUS.COMPLETED) {
        throw new AppError('Cannot delete completed vaccination records', 403);
      }

      await VaccinationRecord.findByIdAndDelete(id);

      logger.info(`Vaccination record deleted: ${id} by admin ${req.user.email || userId}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Vaccination record deleted successfully')
      );

    } catch (error) {
      logger.error('Delete vaccination record error:', error);
      next(error);
    }
  }

  /**
   * Get vaccination statistics
   */
  async getVaccinationStatistics(req, res, next) {
    try {
      const { childId, parentId, startDate, endDate } = req.query;
      const userId = req.user._id || req.user.userId;
      const userRole = req.user.role;

      // Build filter based on permissions
      let filter = {};

      if (childId) {
        if (!childId.match(/^[0-9a-fA-F]{24}$/)) {
          throw new AppError('Invalid child ID format', 400);
        }

        const child = await Child.findById(childId);
        if (!child) {
          throw new AppError(ERROR_MESSAGES.CHILD_NOT_FOUND || 'Child not found', 404);
        }

        if (userRole === USER_ROLES.PARENT && child.parent.toString() !== userId.toString()) {
          throw new AppError(ERROR_MESSAGES.CHILD_NOT_OWNED || 'Access denied', 403);
        }

        filter.child = childId;
      } else if (parentId && (userRole === USER_ROLES.ADMIN || userRole === USER_ROLES.DOCTOR)) {
        if (!parentId.match(/^[0-9a-fA-F]{24}$/)) {
          throw new AppError('Invalid parent ID format', 400);
        }
        
        const children = await Child.find({ parent: parentId }).select('_id');
        filter.child = { $in: children.map(child => child._id) };
      } else if (userRole === USER_ROLES.PARENT) {
        const children = await Child.find({ parent: userId }).select('_id');
        filter.child = { $in: children.map(child => child._id) };
      }

      // Validate date range
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          throw new AppError('Invalid date format', 400);
        }
        
        if (start > end) {
          throw new AppError('Start date cannot be after end date', 400);
        }
        
        filter.scheduledDate = {
          $gte: start,
          $lte: end
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
        {
          $sort: { '_id.year': 1, '_id.month': 1 }
        }
      ]);

      // Get age group statistics
      const ageGroupStats = await VaccinationRecord.aggregate([
        { $match: filter },
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
          $addFields: {
            ageInMonths: {
              $divide: [
                { $subtract: [new Date(), '$childInfo.dateOfBirth'] },
                1000 * 60 * 60 * 24 * 30.44 // Approximate days per month
              ]
            }
          }
        },
        {
          $addFields: {
            ageGroup: {
              $switch: {
                branches: [
                  { case: { $lt: ['$ageInMonths', 2] }, then: '0-2 months' },
                  { case: { $lt: ['$ageInMonths', 6] }, then: '2-6 months' },
                  { case: { $lt: ['$ageInMonths', 12] }, then: '6-12 months' },
                  { case: { $lt: ['$ageInMonths', 24] }, then: '1-2 years' },
                  { case: { $lt: ['$ageInMonths', 60] }, then: '2-5 years' },
                  { case: { $gte: ['$ageInMonths', 60] }, then: '5+ years' }
                ],
                default: 'Unknown'
              }
            }
          }
        },
        {
          $group: {
            _id: '$ageGroup',
            total: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            scheduled: { $sum: { $cond: [{ $eq: ['$status', 'scheduled'] }, 1, 0] } },
            overdue: { $sum: { $cond: [{ $eq: ['$status', 'overdue'] }, 1, 0] } }
          }
        },
        { $sort: { '_id': 1 } }
      ]);

      // Get completion rate by vaccine type
      const completionRateByVaccine = await VaccinationRecord.aggregate([
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
            _id: '$vaccineInfo.type',
            total: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }
          }
        },
        {
          $addFields: {
            completionRate: {
              $cond: [
                { $eq: ['$total', 0] },
                0,
                { $multiply: [{ $divide: ['$completed', '$total'] }, 100] }
              ]
            }
          }
        },
        { $sort: { completionRate: -1 } }
      ]);

      // Get overall statistics
      const totalRecords = await VaccinationRecord.countDocuments(filter);
      const completedCount = await VaccinationRecord.countDocuments({
        ...filter,
        status: VACCINATION_STATUS.COMPLETED
      });
      const scheduledCount = await VaccinationRecord.countDocuments({
        ...filter,
        status: VACCINATION_STATUS.SCHEDULED
      });
      const overdueCount = await VaccinationRecord.countDocuments({
        ...filter,
        status: VACCINATION_STATUS.OVERDUE,
        scheduledDate: { $lt: new Date() }
      });

      const overallCompletionRate = totalRecords > 0 ? (completedCount / totalRecords) * 100 : 0;

      const statistics = {
        overview: {
          totalRecords,
          completedCount,
          scheduledCount,
          overdueCount,
          overallCompletionRate: parseFloat(overallCompletionRate.toFixed(2))
        },
        statusBreakdown: statusStats,
        vaccineStats,
        monthlyTrends,
        ageGroupStats,
        completionRateByVaccine
      };

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Vaccination statistics retrieved successfully', { statistics })
      );

    } catch (error) {
      logger.error('Get vaccination statistics error:', error);
      next(error);
    }
  }

  /**
   * Get vaccination reminders
   */
  async getVaccinationReminders(req, res, next) {
    try {
      const { childId, days = 7 } = req.query;
      const userId = req.user._id || req.user.userId;
      const userRole = req.user.role;

      // Validate and sanitize inputs
      const daysNum = Math.min(30, Math.max(1, parseInt(days)));
      const reminderDate = new Date(Date.now() + (daysNum * 24 * 60 * 60 * 1000));

      let filter = {
        status: VACCINATION_STATUS.SCHEDULED,
        scheduledDate: {
          $gte: new Date(),
          $lte: reminderDate
        }
      };

      // Apply permission filtering
      if (userRole === USER_ROLES.PARENT) {
        const children = await Child.find({ parent: userId }).select('_id');
        filter.child = { $in: children.map(child => child._id) };
      }

      if (childId) {
        if (!childId.match(/^[0-9a-fA-F]{24}$/)) {
          throw new AppError('Invalid child ID format', 400);
        }
        filter.child = childId;
      }

      const reminders = await VaccinationRecord.find(filter)
        .populate('child', 'firstName lastName dateOfBirth parent')
        .populate('vaccine', 'name type manufacturer')
        .sort({ scheduledDate: 1 });

      // Calculate days until vaccination for each reminder
      const remindersWithDays = reminders.map(reminder => {
        const daysUntil = Math.ceil((reminder.scheduledDate - new Date()) / (1000 * 60 * 60 * 24));
        return {
          ...reminder.toObject(),
          daysUntil: Math.max(0, daysUntil)
        };
      });

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, 'Vaccination reminders retrieved successfully', {
          reminders: remindersWithDays,
          total: remindersWithDays.length,
          daysAhead: daysNum
        })
      );

    } catch (error) {
      logger.error('Get vaccination reminders error:', error);
      next(error);
    }
  }

  /**
   * Bulk update vaccination status (Admin/Doctor only)
   */
  async bulkUpdateVaccinationStatus(req, res, next) {
    try {
      const { recordIds, status, reason } = req.body;
      const userId = req.user._id || req.user.userId;
      const userRole = req.user.role;

      // Only admins and doctors can perform bulk operations
      if (userRole !== USER_ROLES.ADMIN && userRole !== USER_ROLES.DOCTOR) {
        throw new AppError('Access denied. Admin or Doctor role required.', 403);
      }

      // Validate required fields
      if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
        throw new AppError('Record IDs array is required', 400);
      }

      if (!status || !Object.values(VACCINATION_STATUS).includes(status)) {
        throw new AppError('Valid status is required', 400);
      }

      // Validate ObjectId formats
      const invalidIds = recordIds.filter(id => !id.match(/^[0-9a-fA-F]{24}$/));
      if (invalidIds.length > 0) {
        throw new AppError(`Invalid record ID formats: ${invalidIds.join(', ')}`, 400);
      }

      // Limit bulk operation size
      if (recordIds.length > 100) {
        throw new AppError('Maximum 100 records can be updated at once', 400);
      }

      // Find records to update
      const records = await VaccinationRecord.find({ _id: { $in: recordIds } });
      if (records.length !== recordIds.length) {
        throw new AppError('Some vaccination records not found', 404);
      }

      // Check if any records are completed (cannot be updated)
      const completedRecords = records.filter(record => record.status === VACCINATION_STATUS.COMPLETED);
      if (completedRecords.length > 0 && status !== VACCINATION_STATUS.COMPLETED) {
        throw new AppError('Cannot update completed vaccination records', 403);
      }

      // Prepare update data
      const updateData = {
        status,
        lastModifiedBy: userId,
        lastModifiedAt: new Date()
      };

      // Add specific fields based on status
      if (status === VACCINATION_STATUS.CANCELLED && reason) {
        updateData.cancellationReason = reason;
        updateData.cancelledBy = userId;
        updateData.cancelledAt = new Date();
      } else if (status === VACCINATION_STATUS.MISSED && reason) {
        updateData.missedReason = reason;
        updateData.missedBy = userId;
        updateData.missedAt = new Date();
      }

      // Perform bulk update
      const result = await VaccinationRecord.updateMany(
        { _id: { $in: recordIds } },
        { $set: updateData }
      );

      logger.info(`Bulk update performed: ${result.modifiedCount} records updated to ${status} by ${req.user.email || userId}`);

      res.status(HTTP_STATUS.OK).json(
        createApiResponse(true, `Successfully updated ${result.modifiedCount} vaccination records`, {
          updatedCount: result.modifiedCount,
          status,
          recordIds
        })
      );

    } catch (error) {
      logger.error('Bulk update vaccination status error:', error);
      next(error);
    }
  }

  /**
   * Export vaccination records (Admin/Doctor only)
   */
  async exportVaccinationRecords(req, res, next) {
    try {
      const { format = 'csv', childId, status, startDate, endDate } = req.query;
      const userId = req.user._id || req.user.userId;
      const userRole = req.user.role;

      // Only admins and doctors can export data
      if (userRole !== USER_ROLES.ADMIN && userRole !== USER_ROLES.DOCTOR) {
        throw new AppError('Access denied. Admin or Doctor role required.', 403);
      }

      // Validate format
      if (!['csv', 'json'].includes(format)) {
        throw new AppError('Invalid export format. Use csv or json.', 400);
      }

      // Build filter
      let filter = {};

      if (childId) {
        if (!childId.match(/^[0-9a-fA-F]{24}$/)) {
          throw new AppError('Invalid child ID format', 400);
        }
        filter.child = childId;
      }

      if (status && Object.values(VACCINATION_STATUS).includes(status)) {
        filter.status = status;
      }

      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          throw new AppError('Invalid date format', 400);
        }
        
        if (start > end) {
          throw new AppError('Start date cannot be after end date', 400);
        }
        
        filter.scheduledDate = {
          $gte: start,
          $lte: end
        };
      }

      // Get records with populated data
      const records = await VaccinationRecord.find(filter)
        .populate('child', 'firstName lastName dateOfBirth')
        .populate('vaccine', 'name type manufacturer')
        .populate('createdBy', 'firstName lastName')
        .populate('completedBy', 'firstName lastName')
        .sort({ scheduledDate: 1 })
        .lean();

      // Transform data for export
      const exportData = records.map(record => ({
        recordId: record._id,
        childName: `${record.child.firstName} ${record.child.lastName}`,
        childDateOfBirth: record.child.dateOfBirth,
        vaccineName: record.vaccine.name,
        vaccineType: record.vaccine.type,
        vaccineManufacturer: record.vaccine.manufacturer,
        doseNumber: record.doseNumber,
        scheduledDate: record.scheduledDate,
        administeredDate: record.administeredDate || null,
        status: record.status,
        location: record.location || null,
        administeredBy: record.administeredBy || null,
        batchNumber: record.batchNumber || null,
        sideEffects: record.sideEffects ? record.sideEffects.join(', ') : null,
        notes: record.notes || null,
        createdBy: record.createdBy ? `${record.createdBy.firstName} ${record.createdBy.lastName}` : null,
        createdAt: record.createdAt,
        completedBy: record.completedBy ? `${record.completedBy.firstName} ${record.completedBy.lastName}` : null,
        completedAt: record.completedAt || null
      }));

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=vaccination_records_${Date.now()}.json`);
        res.status(HTTP_STATUS.OK).json({
          exportDate: new Date().toISOString(),
          totalRecords: exportData.length,
          data: exportData
        });
      } else {
        // CSV format
        const csv = require('csv-stringify');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=vaccination_records_${Date.now()}.csv`);
        
        csv.stringify(exportData, { header: true }, (err, output) => {
          if (err) {
            throw new AppError('Error generating CSV export', 500);
          }
          res.status(HTTP_STATUS.OK).send(output);
        });
      }

      logger.info(`Vaccination records exported: ${exportData.length} records in ${format} format by ${req.user.email || userId}`);

    } catch (error) {
      logger.error('Export vaccination records error:', error);
      next(error);
    }
  }
}

module.exports = new VaccinationRecordController();