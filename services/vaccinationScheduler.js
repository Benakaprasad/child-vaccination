const cron = require('node-cron');
const Child = require('../models/Child');
const Vaccine = require('../models/Vaccine');
const VaccinationRecord = require('../models/VaccinationRecord');
const Notification = require('../models/Notification');
const notificationService = require('./notificationService');
const { 
  VACCINATION_STATUS, 
  NOTIFICATION_TYPES,
  CRON_SCHEDULES 
} = require('../utils/constants');
const { 
  calculateAge, 
  getDaysUntil, 
  isVaccinationOverdue,
  generateVaccinationSchedule 
} = require('../utils/helpers');
const logger = require('../utils/logger');

class VaccinationScheduler {
  constructor() {
    this.jobs = new Map();
    this.isRunning = false;
  }

  /**
   * Initialize scheduler and start cron jobs
   */
  initialize() {
    try {
      logger.info('Initializing vaccination scheduler...');

      // Daily reminder check at 9 AM
      this.scheduleJob('daily-reminders', CRON_SCHEDULES.DAILY_REMINDERS, () => {
        this.processUpcomingVaccinations();
      });

      // Daily overdue check at 10 AM
      this.scheduleJob('overdue-check', CRON_SCHEDULES.OVERDUE_CHECK, () => {
        this.processOverdueVaccinations();
      });

      // Weekly cleanup at 2 AM on Sunday
      this.scheduleJob('cleanup-logs', CRON_SCHEDULES.CLEANUP_LOGS, () => {
        this.cleanupOldNotifications();
      });

      this.isRunning = true;
      logger.info('Vaccination scheduler initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize vaccination scheduler:', error);
      throw error;
    }
  }

  /**
   * Schedule a cron job
   * @param {String} name - Job name
   * @param {String} schedule - Cron schedule
   * @param {Function} task - Task function
   */
  scheduleJob(name, schedule, task) {
    try {
      const job = cron.schedule(schedule, async () => {
        logger.info(`Running scheduled job: ${name}`);
        try {
          await task();
          logger.info(`Completed scheduled job: ${name}`);
        } catch (error) {
          logger.error(`Error in scheduled job ${name}:`, error);
        }
      }, {
        scheduled: false,
        timezone: process.env.TIMEZONE || 'America/New_York'
      });

      this.jobs.set(name, job);
      job.start();

      logger.info(`Scheduled job '${name}' created with schedule: ${schedule}`);

    } catch (error) {
      logger.error(`Failed to schedule job '${name}':`, error);
    }
  }

  /**
   * Process upcoming vaccinations and send reminders
   */
  async processUpcomingVaccinations() {
    try {
      logger.info('Processing upcoming vaccinations for reminders...');

      const reminderDays = [1, 3, 7, 14]; // Send reminders at these intervals
      let totalReminders = 0;

      for (const days of reminderDays) {
        const upcomingDate = new Date();
        upcomingDate.setDate(upcomingDate.getDate() + days);

        // Find vaccinations scheduled for the reminder date
        const upcomingVaccinations = await VaccinationRecord.find({
          status: VACCINATION_STATUS.SCHEDULED,
          scheduledDate: {
            $gte: new Date(upcomingDate.setHours(0, 0, 0, 0)),
            $lt: new Date(upcomingDate.setHours(23, 59, 59, 999))
          }
        }).populate('child vaccine');

        for (const vaccination of upcomingVaccinations) {
          // Check if reminder already sent for this timeframe
          const existingReminder = await Notification.findOne({
            vaccinationRecord: vaccination._id,
            type: NOTIFICATION_TYPES.REMINDER,
            createdAt: {
              $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
            }
          });

          if (!existingReminder) {
            try {
              const notification = await notificationService.createVaccinationReminder(
                vaccination._id,
                days
              );

              if (notification) {
                await notificationService.sendNotification(notification._id);
                totalReminders++;
              }
            } catch (error) {
              logger.error(`Failed to send reminder for vaccination ${vaccination._id}:`, error);
            }
          }
        }
      }

      logger.info(`Processed upcoming vaccinations: ${totalReminders} reminders sent`);

    } catch (error) {
      logger.error('Error processing upcoming vaccinations:', error);
    }
  }

  /**
   * Process overdue vaccinations and send alerts
   */
  async processOverdueVaccinations() {
    try {
      logger.info('Processing overdue vaccinations...');

      const overdueVaccinations = await VaccinationRecord.find({
        status: VACCINATION_STATUS.SCHEDULED,
        scheduledDate: { $lt: new Date() }
      }).populate('child vaccine');

      let overdueCount = 0;
      let alertsSent = 0;

      for (const vaccination of overdueVaccinations) {
        const daysOverdue = Math.abs(getDaysUntil(vaccination.scheduledDate));
        
        // Consider as overdue after 7 days grace period
        if (daysOverdue >= 7) {
          overdueCount++;

          // Update vaccination status to overdue
          vaccination.status = VACCINATION_STATUS.OVERDUE;
          await vaccination.save();

          // Check if overdue alert already sent in the last week
          const existingAlert = await Notification.findOne({
            vaccinationRecord: vaccination._id,
            type: NOTIFICATION_TYPES.OVERDUE,
            createdAt: {
              $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
            }
          });

          if (!existingAlert) {
            try {
              const notification = await notificationService.createOverdueNotification(vaccination._id);
              
              if (notification) {
                await notificationService.sendNotification(notification._id);
                alertsSent++;
              }
            } catch (error) {
              logger.error(`Failed to send overdue alert for vaccination ${vaccination._id}:`, error);
            }
          }
        }
      }

      logger.info(`Processed overdue vaccinations: ${overdueCount} overdue, ${alertsSent} alerts sent`);

    } catch (error) {
      logger.error('Error processing overdue vaccinations:', error);
    }
  }

  /**
   * Generate vaccination schedule for a child
   * @param {String} childId - Child ID
   * @returns {Object} Generated schedule
   */
  async generateScheduleForChild(childId) {
    try {
      const child = await Child.findById(childId);
      if (!child) {
        throw new Error('Child not found');
      }

      const childAgeInDays = calculateAge(child.dateOfBirth, 'days');

      // Get all active vaccines
      const vaccines = await Vaccine.find({ isActive: true });

      // Get existing vaccination records for this child
      const existingRecords = await VaccinationRecord.find({ child: childId });
      const existingVaccinations = new Set();
      
      existingRecords.forEach(record => {
        existingVaccinations.add(`${record.vaccine}_${record.doseNumber}`);
      });

      const schedule = [];
      let scheduledCount = 0;
      let eligibleCount = 0;

      for (const vaccine of vaccines) {
        // Check if child is eligible for this vaccine
        const isEligible = vaccine.ageGroups.some(ageGroup => {
          const minAgeInDays = this.convertAgeToDays(ageGroup.minAge, ageGroup.unit);
          const maxAgeInDays = this.convertAgeToDays(ageGroup.maxAge, ageGroup.unit);
          return childAgeInDays >= minAgeInDays && childAgeInDays <= maxAgeInDays;
        });

        if (isEligible) {
          eligibleCount++;

          for (const dose of vaccine.schedule) {
            const vaccineKey = `${vaccine._id}_${dose.dose}`;
            
            // Skip if vaccination already exists
            if (!existingVaccinations.has(vaccineKey)) {
              const scheduledDate = new Date(child.dateOfBirth);
              scheduledDate.setDate(scheduledDate.getDate() + dose.ageInDays);

              // Only schedule future vaccinations or recently due ones
              const today = new Date();
              const gracePeriod = 30; // 30 days grace period for missed vaccinations
              const earliestScheduleDate = new Date(today.getTime() - (gracePeriod * 24 * 60 * 60 * 1000));

              if (scheduledDate >= earliestScheduleDate) {
                const vaccinationRecord = new VaccinationRecord({
                  child: childId,
                  vaccine: vaccine._id,
                  doseNumber: dose.dose,
                  scheduledDate: scheduledDate > today ? scheduledDate : today,
                  status: VACCINATION_STATUS.SCHEDULED,
                  notes: `Auto-scheduled for ${child.firstName} - ${dose.description}`
                });

                await vaccinationRecord.save();
                schedule.push(vaccinationRecord);
                scheduledCount++;
              }
            }
          }
        }
      }

      logger.info(`Generated schedule for child ${childId}: ${scheduledCount} vaccinations scheduled from ${eligibleCount} eligible vaccines`);

      return {
        childId,
        childName: `${child.firstName} ${child.lastName}`,
        childAge: childAgeInDays,
        eligibleVaccines: eligibleCount,
        scheduledVaccinations: scheduledCount,
        schedule: schedule.sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate))
      };

    } catch (error) {
      logger.error(`Error generating schedule for child ${childId}:`, error);
      throw error;
    }
  }

  /**
   * Generate schedules for all children
   * @returns {Array} Generated schedules
   */
  async generateSchedulesForAllChildren() {
    try {
      logger.info('Generating vaccination schedules for all children...');

      const children = await Child.find({});
      const results = [];

      for (const child of children) {
        try {
          const schedule = await this.generateScheduleForChild(child._id);
          results.push(schedule);
        } catch (error) {
          logger.error(`Failed to generate schedule for child ${child._id}:`, error);
          results.push({
            childId: child._id,
            error: error.message,
            success: false
          });
        }
      }

      const successful = results.filter(r => !r.error).length;
      logger.info(`Generated schedules for ${successful}/${children.length} children`);

      return results;

    } catch (error) {
      logger.error('Error generating schedules for all children:', error);
      throw error;
    }
  }

  /**
   * Check and update vaccination schedules when new vaccines are added
   * @param {String} vaccineId - New vaccine ID
   */
  async updateSchedulesForNewVaccine(vaccineId) {
    try {
      const vaccine = await Vaccine.findById(vaccineId);
      if (!vaccine) {
        throw new Error('Vaccine not found');
      }

      logger.info(`Updating schedules for new vaccine: ${vaccine.name}`);

      const children = await Child.find({});
      let updatedCount = 0;

      for (const child of children) {
        const childAgeInDays = calculateAge(child.dateOfBirth, 'days');

        // Check if child is eligible for this vaccine
        const isEligible = vaccine.ageGroups.some(ageGroup => {
          const minAgeInDays = this.convertAgeToDays(ageGroup.minAge, ageGroup.unit);
          const maxAgeInDays = this.convertAgeToDays(ageGroup.maxAge, ageGroup.unit);
          return childAgeInDays >= minAgeInDays && childAgeInDays <= maxAgeInDays;
        });

        if (isEligible) {
          // Check existing records for this vaccine
          const existingRecords = await VaccinationRecord.find({
            child: child._id,
            vaccine: vaccineId
          });

          const existingDoses = new Set(existingRecords.map(r => r.doseNumber));

          // Schedule missing doses
          for (const dose of vaccine.schedule) {
            if (!existingDoses.has(dose.dose)) {
              const scheduledDate = new Date(child.dateOfBirth);
              scheduledDate.setDate(scheduledDate.getDate() + dose.ageInDays);

              // Only schedule if not too far in the past
              const today = new Date();
              const gracePeriod = 30;
              const earliestScheduleDate = new Date(today.getTime() - (gracePeriod * 24 * 60 * 60 * 1000));

              if (scheduledDate >= earliestScheduleDate) {
                const vaccinationRecord = new VaccinationRecord({
                  child: child._id,
                  vaccine: vaccineId,
                  doseNumber: dose.dose,
                  scheduledDate: scheduledDate > today ? scheduledDate : today,
                  status: VACCINATION_STATUS.SCHEDULED,
                  notes: `Auto-scheduled for new vaccine - ${dose.description}`
                });

                await vaccinationRecord.save();
                updatedCount++;
              }
            }
          }
        }
      }

      logger.info(`Updated schedules for new vaccine ${vaccine.name}: ${updatedCount} vaccinations scheduled`);

      return {
        vaccineId,
        vaccineName: vaccine.name,
        childrenEvaluated: children.length,
        vaccinationsScheduled: updatedCount
      };

    } catch (error) {
      logger.error(`Error updating schedules for new vaccine ${vaccineId}:`, error);
      throw error;
    }
  }

  /**
   * Clean up old notifications and records
   */
  async cleanupOldNotifications() {
    try {
      logger.info('Cleaning up old notifications...');

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90); // Keep 90 days of notifications

      const result = await Notification.deleteMany({
        createdAt: { $lt: cutoffDate },
        status: { $in: ['sent', 'failed'] }
      });

      logger.info(`Cleaned up ${result.deletedCount} old notifications`);

      // Also clean up completed vaccination records older than 2 years
      const recordsCutoffDate = new Date();
      recordsCutoffDate.setFullYear(recordsCutoffDate.getFullYear() - 2);

      const recordsResult = await VaccinationRecord.deleteMany({
        status: VACCINATION_STATUS.COMPLETED,
        administeredDate: { $lt: recordsCutoffDate }
      });

      logger.info(`Cleaned up ${recordsResult.deletedCount} old vaccination records`);

      return {
        notificationsDeleted: result.deletedCount,
        recordsDeleted: recordsResult.deletedCount
      };

    } catch (error) {
      logger.error('Error cleaning up old data:', error);
      throw error;
    }
  }

  /**
   * Get vaccination statistics for dashboard
   * @param {String} parentId - Parent ID (optional)
   * @returns {Object} Vaccination statistics
   */
  async getVaccinationStatistics(parentId = null) {
    try {
      const filter = parentId ? { 
        child: { 
          $in: await Child.find({ parent: parentId }).distinct('_id') 
        } 
      } : {};

      const stats = await VaccinationRecord.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      const upcomingCount = await VaccinationRecord.countDocuments({
        ...filter,
        status: VACCINATION_STATUS.SCHEDULED,
        scheduledDate: {
          $gte: new Date(),
          $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Next 30 days
        }
      });

      const overdueCount = await VaccinationRecord.countDocuments({
        ...filter,
        status: { $in: [VACCINATION_STATUS.SCHEDULED, VACCINATION_STATUS.OVERDUE] },
        scheduledDate: { $lt: new Date() }
      });

      return {
        statusBreakdown: stats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {}),
        upcomingVaccinations: upcomingCount,
        overdueVaccinations: overdueCount,
        totalVaccinations: stats.reduce((sum, stat) => sum + stat.count, 0)
      };

    } catch (error) {
      logger.error('Error getting vaccination statistics:', error);
      throw error;
    }
  }

  /**
   * Convert age to days
   * @param {Number} value - Age value
   * @param {String} unit - Age unit
   * @returns {Number} Age in days
   */
  convertAgeToDays(value, unit) {
    const conversions = {
      days: 1,
      weeks: 7,
      months: 30.44,
      years: 365.25
    };
    
    return Math.floor(value * conversions[unit]);
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    try {
      this.jobs.forEach((job, name) => {
        job.stop();
        logger.info(`Stopped scheduled job: ${name}`);
      });

      this.jobs.clear();
      this.isRunning = false;
      logger.info('Vaccination scheduler stopped');

    } catch (error) {
      logger.error('Error stopping vaccination scheduler:', error);
    }
  }

  /**
   * Restart scheduler
   */
  restart() {
    this.stop();
    this.initialize();
  }

  /**
   * Get scheduler status
   * @returns {Object} Scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeJobs: Array.from(this.jobs.keys()),
      jobCount: this.jobs.size,
      uptime: this.isRunning ? Date.now() - this.startTime : 0
    };
  }

  /**
   * Process pending notifications manually
   * @returns {Object} Processing results
   */
  async processPendingNotifications() {
    return await notificationService.processPendingNotifications();
  }

  /**
   * Force run a specific job
   * @param {String} jobName - Job name to run
   * @returns {Object} Execution result
   */
  async runJob(jobName) {
    try {
      switch (jobName) {
        case 'daily-reminders':
          await this.processUpcomingVaccinations();
          break;
        case 'overdue-check':
          await this.processOverdueVaccinations();
          break;
        case 'cleanup-logs':
          await this.cleanupOldNotifications();
          break;
        default:
          throw new Error(`Unknown job: ${jobName}`);
      }

      return {
        success: true,
        message: `Job ${jobName} executed successfully`,
        executedAt: new Date()
      };

    } catch (error) {
      logger.error(`Error running job ${jobName}:`, error);
      throw error;
    }
  }
}

module.exports = new VaccinationScheduler();