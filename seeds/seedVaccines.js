require('dotenv').config();
const mongoose = require('mongoose');
const Vaccine = require('../models/Vaccine');
const { VACCINE_TYPES, AGE_UNITS } = require('../utils/constants');
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

// Vaccine seed data
const vaccineData = [
  {
    name: 'Hepatitis B',
    description: 'Protects against hepatitis B virus infection, which can cause liver disease.',
    manufacturer: 'GlaxoSmithKline',
    type: VACCINE_TYPES.INACTIVATED,
    ageGroups: [
      {
        minAge: 0,
        maxAge: 18,
        unit: AGE_UNITS.YEARS
      }
    ],
    schedule: [
      {
        dose: 1,
        ageInDays: 0,
        description: 'Birth dose (within 24 hours of birth)'
      },
      {
        dose: 2,
        ageInDays: 30,
        description: '1-2 months'
      },
      {
        dose: 3,
        ageInDays: 180,
        description: '6-18 months'
      }
    ],
    sideEffects: [
      'Mild fever',
      'Pain at injection site',
      'Redness at injection site',
      'Fatigue'
    ],
    contraindications: [
      'Severe illness with fever',
      'Known allergy to vaccine components',
      'Previous severe allergic reaction to hepatitis B vaccine'
    ],
    isActive: true
  },
  {
    name: 'DTaP (Diphtheria, Tetanus, Pertussis)',
    description: 'Protects against diphtheria, tetanus, and pertussis (whooping cough).',
    manufacturer: 'Sanofi Pasteur',
    type: VACCINE_TYPES.INACTIVATED,
    ageGroups: [
      {
        minAge: 6,
        maxAge: 7,
        unit: AGE_UNITS.YEARS
      }
    ],
    schedule: [
      {
        dose: 1,
        ageInDays: 60,
        description: '2 months'
      },
      {
        dose: 2,
        ageInDays: 120,
        description: '4 months'
      },
      {
        dose: 3,
        ageInDays: 180,
        description: '6 months'
      },
      {
        dose: 4,
        ageInDays: 450,
        description: '15-18 months'
      },
      {
        dose: 5,
        ageInDays: 1825,
        description: '4-6 years'
      }
    ],
    sideEffects: [
      'Mild fever',
      'Pain, redness, or swelling at injection site',
      'Fussiness',
      'Drowsiness',
      'Loss of appetite'
    ],
    contraindications: [
      'Severe illness with fever',
      'Previous severe allergic reaction to DTaP',
      'Encephalopathy within 7 days of previous dose'
    ],
    isActive: true
  },
  {
    name: 'Polio (IPV)',
    description: 'Inactivated poliovirus vaccine protects against poliomyelitis.',
    manufacturer: 'Sanofi Pasteur',
    type: VACCINE_TYPES.INACTIVATED,
    ageGroups: [
      {
        minAge: 6,
        maxAge: 18,
        unit: AGE_UNITS.YEARS
      }
    ],
    schedule: [
      {
        dose: 1,
        ageInDays: 60,
        description: '2 months'
      },
      {
        dose: 2,
        ageInDays: 120,
        description: '4 months'
      },
      {
        dose: 3,
        ageInDays: 180,
        description: '6-18 months'
      },
      {
        dose: 4,
        ageInDays: 1825,
        description: '4-6 years'
      }
    ],
    sideEffects: [
      'Pain at injection site',
      'Redness at injection site',
      'Mild fever'
    ],
    contraindications: [
      'Severe illness with fever',
      'Known allergy to vaccine components',
      'Previous severe allergic reaction to IPV'
    ],
    isActive: true
  },
  {
    name: 'Haemophilus influenzae type b (Hib)',
    description: 'Protects against Haemophilus influenzae type b bacteria.',
    manufacturer: 'Pfizer',
    type: VACCINE_TYPES.CONJUGATE,
    ageGroups: [
      {
        minAge: 6,
        maxAge: 5,
        unit: AGE_UNITS.YEARS
      }
    ],
    schedule: [
      {
        dose: 1,
        ageInDays: 60,
        description: '2 months'
      },
      {
        dose: 2,
        ageInDays: 120,
        description: '4 months'
      },
      {
        dose: 3,
        ageInDays: 180,
        description: '6 months (if needed)'
      },
      {
        dose: 4,
        ageInDays: 365,
        description: '12-15 months'
      }
    ],
    sideEffects: [
      'Pain at injection site',
      'Redness at injection site',
      'Mild fever',
      'Fussiness'
    ],
    contraindications: [
      'Severe illness with fever',
      'Known allergy to vaccine components',
      'Age less than 6 weeks'
    ],
    isActive: true
  },
  {
    name: 'Pneumococcal Conjugate (PCV13)',
    description: 'Protects against 13 types of pneumococcal bacteria.',
    manufacturer: 'Pfizer',
    type: VACCINE_TYPES.CONJUGATE,
    ageGroups: [
      {
        minAge: 6,
        maxAge: 5,
        unit: AGE_UNITS.YEARS
      }
    ],
    schedule: [
      {
        dose: 1,
        ageInDays: 60,
        description: '2 months'
      },
      {
        dose: 2,
        ageInDays: 120,
        description: '4 months'
      },
      {
        dose: 3,
        ageInDays: 180,
        description: '6 months'
      },
      {
        dose: 4,
        ageInDays: 365,
        description: '12-15 months'
      }
    ],
    sideEffects: [
      'Pain, redness, or swelling at injection site',
      'Mild fever',
      'Decreased appetite',
      'Fussiness',
      'Increased sleepiness'
    ],
    contraindications: [
      'Severe illness with fever',
      'Known allergy to vaccine components',
      'Previous severe allergic reaction to PCV13'
    ],
    isActive: true
  },
  {
    name: 'MMR (Measles, Mumps, Rubella)',
    description: 'Protects against measles, mumps, and rubella.',
    manufacturer: 'Merck',
    type: VACCINE_TYPES.LIVE,
    ageGroups: [
      {
        minAge: 12,
        maxAge: 18,
        unit: AGE_UNITS.YEARS
      }
    ],
    schedule: [
      {
        dose: 1,
        ageInDays: 365,
        description: '12-15 months'
      },
      {
        dose: 2,
        ageInDays: 1825,
        description: '4-6 years'
      }
    ],
    sideEffects: [
      'Pain at injection site',
      'Mild fever',
      'Mild rash',
      'Temporary swelling of glands'
    ],
    contraindications: [
      'Pregnancy',
      'Severe immunodeficiency',
      'Severe illness with fever',
      'Recent blood transfusion',
      'Known allergy to vaccine components'
    ],
    isActive: true
  },
  {
    name: 'Varicella (Chickenpox)',
    description: 'Protects against varicella (chickenpox) virus.',
    manufacturer: 'Merck',
    type: VACCINE_TYPES.LIVE,
    ageGroups: [
      {
        minAge: 12,
        maxAge: 18,
        unit: AGE_UNITS.YEARS
      }
    ],
    schedule: [
      {
        dose: 1,
        ageInDays: 365,
        description: '12-15 months'
      },
      {
        dose: 2,
        ageInDays: 1825,
        description: '4-6 years'
      }
    ],
    sideEffects: [
      'Pain at injection site',
      'Mild fever',
      'Mild rash',
      'Temporary soreness'
    ],
    contraindications: [
      'Pregnancy',
      'Severe immunodeficiency',
      'Severe illness with fever',
      'Recent blood transfusion',
      'Known allergy to vaccine components'
    ],
    isActive: true
  },
  {
    name: 'Hepatitis A',
    description: 'Protects against hepatitis A virus infection.',
    manufacturer: 'GlaxoSmithKline',
    type: VACCINE_TYPES.INACTIVATED,
    ageGroups: [
      {
        minAge: 12,
        maxAge: 18,
        unit: AGE_UNITS.YEARS
      }
    ],
    schedule: [
      {
        dose: 1,
        ageInDays: 365,
        description: '12-23 months'
      },
      {
        dose: 2,
        ageInDays: 545,
        description: '6 months after first dose'
      }
    ],
    sideEffects: [
      'Pain at injection site',
      'Redness at injection site',
      'Mild fever',
      'Fatigue'
    ],
    contraindications: [
      'Severe illness with fever',
      'Known allergy to vaccine components',
      'Previous severe allergic reaction to hepatitis A vaccine'
    ],
    isActive: true
  },
  {
    name: 'Rotavirus (RV)',
    description: 'Protects against rotavirus, a common cause of severe diarrhea in infants.',
    manufacturer: 'Merck',
    type: VACCINE_TYPES.LIVE,
    ageGroups: [
      {
        minAge: 6,
        maxAge: 8,
        unit: AGE_UNITS.MONTHS
      }
    ],
    schedule: [
      {
        dose: 1,
        ageInDays: 60,
        description: '2 months'
      },
      {
        dose: 2,
        ageInDays: 120,
        description: '4 months'
      },
      {
        dose: 3,
        ageInDays: 180,
        description: '6 months (if using RotaTeq)'
      }
    ],
    sideEffects: [
      'Mild diarrhea',
      'Vomiting',
      'Fever',
      'Fussiness'
    ],
    contraindications: [
      'Severe immunodeficiency',
      'History of intussusception',
      'Severe illness with fever',
      'Known allergy to vaccine components'
    ],
    isActive: true
  },
  {
    name: 'Influenza (Annual)',
    description: 'Annual vaccination to protect against seasonal influenza.',
    manufacturer: 'Various',
    type: VACCINE_TYPES.INACTIVATED,
    ageGroups: [
      {
        minAge: 6,
        maxAge: 100,
        unit: AGE_UNITS.YEARS
      }
    ],
    schedule: [
      {
        dose: 1,
        ageInDays: 180,
        description: 'Annually starting at 6 months'
      }
    ],
    sideEffects: [
      'Pain at injection site',
      'Mild fever',
      'Aches',
      'Fatigue'
    ],
    contraindications: [
      'Severe illness with fever',
      'Known allergy to vaccine components',
      'Previous severe allergic reaction to influenza vaccine'
    ],
    isActive: true
  }
];

// Seed function
const seedVaccines = async () => {
  try {
    await connectDB();
    
    console.log('Seeding vaccine data...');
    
    // Clear existing vaccines
    await Vaccine.deleteMany({});
    console.log('Cleared existing vaccine data');
    
    // Insert new vaccines
    const createdVaccines = await Vaccine.insertMany(vaccineData);
    console.log(`Successfully seeded ${createdVaccines.length} vaccines`);
    
    // Log created vaccines
    createdVaccines.forEach(vaccine => {
      console.log(`- ${vaccine.name} (${vaccine.type})`);
    });
    
    console.log('Vaccine seeding completed successfully!');
    
  } catch (error) {
    console.error('Error seeding vaccines:', error);
    logger.error('Vaccine seeding failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
};

// Run seed function if called directly
if (require.main === module) {
  seedVaccines();
}

module.exports = { seedVaccines, vaccineData };