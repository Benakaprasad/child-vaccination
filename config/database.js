const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    logger.info(`MongoDB Connected: ${conn.connection.host}`);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

    // Handle connection events
    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
      console.log('⚠️ MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
      console.log('✅ MongoDB reconnected');
    });

    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB error:', err);
      console.error('❌ MongoDB error:', err);
    });

  } catch (error) {
    logger.error('Database connection error:', error);
    console.error('❌ Database connection error:', error);
    process.exit(1);
  }
};

module.exports = connectDB;