require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Child = require('../models/Child');
const { USER_ROLES, GENDER_OPTIONS } = require('../utils/constants');
const { hashPassword } = require('../utils/helpers');
const logger = require('../utils/logger');

// Connect to database
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('Database connection error:', error);
    process.exit(1);
  }
};

// User seed data
const userData = [
  {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    password: 'Password123!',
    phone: '+1234567890',
    role: USER_ROLES.PARENT,
    address: {
      street: '123 Main Street',
      city: 'New York',
      state: 'NY',
      zipCode: '10001',
      country: 'USA'
    },
    preferences: {
      notifications: {
        email: true,
        sms: true,
        push: true
      },
      reminderTiming: 7
    }
  },
  {
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'jane.smith@example.com',
    password: 'Password123!',
    phone: '+1234567891',
    role: USER_ROLES.PARENT,
    address: {
      street: '456 Oak Avenue',
      city: 'Los Angeles',
      state: 'CA',
      zipCode: '90210',
      country: 'USA'
    },
    preferences: {
      notifications: {
        email: true,
        sms: false,
        push: true
      },
      reminderTiming: 14
    }
  },
  {
    firstName: 'Dr. Sarah',
    lastName: 'Johnson',
    email: 'dr.sarah@hospital.com',
    password: 'Doctor123!',
    phone: '+1234567892',
    role: USER_ROLES.DOCTOR,
    address: {
      street: '789 Medical Center Drive',
      city: 'Chicago',
      state: 'IL',
      zipCode: '60601',
      country: 'USA'
    },
    preferences: {
      notifications: {
        email: true,
        sms: true,
        push: false
      },
      reminderTiming: 3
    }
  },
  {
    firstName: 'Admin',
    lastName: 'User',
    email: 'admin@vaccination.com',
    password: 'Admin123!',
    phone: '+1234567893',
    role: USER_ROLES.ADMIN,
    address: {
      street: '321 Admin Plaza',
      city: 'Washington',
      state: 'DC',
      zipCode: '20001',
      country: 'USA'
    },
    preferences: {
      notifications: {
        email: true,
        sms: false,
        push: false
      },
      reminderTiming: 1
    }
  },
  {
    firstName: 'Michael',
    lastName: 'Brown',
    email: 'michael.brown@example.com',
    password: 'Password123!',
    phone: '+1234567894',
    role: USER_ROLES.PARENT,
    address: {
      street: '555 Family Lane',
      city: 'Houston',
      state: 'TX',
      zipCode: '77001',
      country: 'USA'
    },
    preferences: {
      notifications: {
        email: true,
        sms: true,
        push: true
      },
      reminderTiming: 10
    }
  }
];

// Child seed data (will be associated with parent users)
const childrenData = [
  {
    firstName: 'Emily',
    lastName: 'Doe',
    dateOfBirth: new Date('2022-03-15'),
    gender: GENDER_OPTIONS.FEMALE,
    bloodType: 'O+',
    allergies: ['Peanuts'],
    medicalConditions: [],
    height: 75, // cm
    weight: 10.5, // kg
    doctorInfo: {
      name: 'Dr. Sarah Johnson',
      phone: '+1234567892',
      clinic: 'Chicago Medical Center'
    },
    emergencyContact: {
      name: 'Jane Doe',
      relationship: 'Mother',
      phone: '+1234567800'
    }
  },
  {
    firstName: 'Alex',
    lastName: 'Doe',
    dateOfBirth: new Date('2020-07-22'),
    gender: GENDER_OPTIONS.MALE,
    bloodType: 'A+',
    allergies: [],
    medicalConditions: ['Asthma'],
    height: 95, // cm
    weight: 14.2, // kg
    doctorInfo: {
      name: 'Dr. Sarah Johnson',
      phone: '+1234567892',
      clinic: 'Chicago Medical Center'
    },
    emergencyContact: {
      name: 'Jane Doe',
      relationship: 'Mother',
      phone: '+1234567800'
    }
  },
  {
    firstName: 'Sophie',
    lastName: 'Smith',
    dateOfBirth: new Date('2021-11-08'),
    gender: GENDER_OPTIONS.FEMALE,
    bloodType: 'B+',
    allergies: ['Eggs', 'Milk'],
    medicalConditions: [],
    height: 85, // cm
    weight: 12.8, // kg
    doctorInfo: {
      name: 'Dr. Sarah Johnson',
      phone: '+1234567892',
      clinic: 'Chicago Medical Center'
    },
    emergencyContact: {
      name: 'Robert Smith',
      relationship: 'Father',
      phone: '+1234567801'
    }
  },
  {
    firstName: 'Lucas',
    lastName: 'Brown',
    dateOfBirth: new Date('2019-01-30'),
    gender: GENDER_OPTIONS.MALE,
    bloodType: 'AB+',
    allergies: [],
    medicalConditions: [],
    height: 110, // cm
    weight: 18.5, // kg
    doctorInfo: {
      name: 'Dr. Sarah Johnson',
      phone: '+1234567892',
      clinic: 'Chicago Medical Center'
    },
    emergencyContact: {
      name: 'Lisa Brown',
      relationship: 'Mother',
      phone: '+1234567802'
    }
  },
  {
    firstName: 'Mia',
    lastName: 'Brown',
    dateOfBirth: new Date('2023-05-12'),
    gender: GENDER_OPTIONS.FEMALE,
    bloodType: 'O-',
    allergies: ['Shellfish'],
    medicalConditions: ['Eczema'],
    height: 65, // cm
    weight: 8.2, // kg
    doctorInfo: {
      name: 'Dr. Sarah Johnson',
      phone: '+1234567892',
      clinic: 'Chicago Medical Center'
    },
    emergencyContact: {
      name: 'Lisa Brown',
      relationship: 'Mother',
      phone: '+1234567802'
    }
  }
];

// Seed function
const seedUsers = async () => {
  try {
    await connectDB();
    
    console.log('Seeding user and child data...');
    
    // Clear existing users and children
    await User.deleteMany({});
    await Child.deleteMany({});
    console.log('Cleared existing user and child data');
    
    // Hash passwords and create users
    const usersToInsert = await Promise.all(
      userData.map(async (user) => ({
        ...user,
        password: await hashPassword(user.password)
      }))
    );
    
    const createdUsers = await User.insertMany(usersToInsert);
    console.log(`Successfully seeded ${createdUsers.length} users`);
    
    // Create a map of user emails to user IDs for reference
    const userMap = {};
    createdUsers.forEach(user => {
      userMap[user.email] = user._id;
    });
    
    // Associate children with parents
    const childParentMapping = [
      { childIndex: 0, parentEmail: 'john.doe@example.com' }, // Emily -> John Doe
      { childIndex: 1, parentEmail: 'john.doe@example.com' }, // Alex -> John Doe
      { childIndex: 2, parentEmail: 'jane.smith@example.com' }, // Sophie -> Jane Smith
      { childIndex: 3, parentEmail: 'michael.brown@example.com' }, // Lucas -> Michael Brown
      { childIndex: 4, parentEmail: 'michael.brown@example.com' }  // Mia -> Michael Brown
    ];
    
    // Create children with parent associations
    const childrenToInsert = childParentMapping.map(mapping => ({
      ...childrenData[mapping.childIndex],
      parent: userMap[mapping.parentEmail]
    }));
    
    const createdChildren = await Child.insertMany(childrenToInsert);
    console.log(`Successfully seeded ${createdChildren.length} children`);
    
    // Update parent users with their children
    for (const mapping of childParentMapping) {
      const parent = createdUsers.find(user => user.email === mapping.parentEmail);
      const child = createdChildren.find(child => 
        child.firstName === childrenData[mapping.childIndex].firstName &&
        child.lastName === childrenData[mapping.childIndex].lastName
      );
      
      if (parent && child) {
        await User.findByIdAndUpdate(
          parent._id,
          { $push: { children: child._id } }
        );
      }
    }
    
    console.log('Updated parent-child relationships');
    
    // Log created users
    console.log('\nCreated Users:');
    createdUsers.forEach(user => {
      console.log(`- ${user.firstName} ${user.lastName} (${user.role}) - ${user.email}`);
    });
    
    // Log created children
    console.log('\nCreated Children:');
    createdChildren.forEach(child => {
      const age = Math.floor((Date.now() - child.dateOfBirth.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      console.log(`- ${child.firstName} ${child.lastName} (${child.gender}, ${age} years old)`);
    });
    
    console.log('\nDefault Login Credentials:');
    console.log('Parent: john.doe@example.com / Password123!');
    console.log('Doctor: dr.sarah@hospital.com / Doctor123!');
    console.log('Admin: admin@vaccination.com / Admin123!');
    
    console.log('\nUser and child seeding completed successfully!');
    
  } catch (error) {
    console.error('Error seeding users and children:', error);
    logger.error('User seeding failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
};

// Run seed function if called directly
if (require.main === module) {
  seedUsers();
}

module.exports = { seedUsers, userData, childrenData };