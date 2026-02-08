const dbManager = require('../config/database');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function initializeDatabase() {
  console.log('Initializing CollabSQL system database...\n');

  try {
    // Create data directory if it doesn't exist
    const dataDir = path.dirname(process.env.SYSTEM_DB_PATH || './data/system.db');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log(`✓ Created data directory: ${dataDir}`);
    }

    // Create upload directory if it doesn't exist
    const uploadDir = process.env.UPLOAD_DIR || './uploads/databases';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
      console.log(`✓ Created upload directory: ${uploadDir}`);
    }

    // Initialize system database
    await dbManager.initializeSystemDb();
    console.log('✓ System database initialized successfully');

    // Check if database already has data
    const userCount = await dbManager.getSystemRow('SELECT COUNT(*) as count FROM users');

    console.log(`\n✓ Initialization complete!`);
    console.log(`  - Users: ${userCount.count}`);

    const dbCount = await dbManager.getSystemRow('SELECT COUNT(*) as count FROM databases');
    console.log(`  - Databases: ${dbCount.count}`);

    console.log('\nYou can now start the server with: npm start');
    console.log('\nDon\'t forget to:');
    console.log('1. Copy .env.example to .env');
    console.log('2. Update JWT_SECRET in .env');
    console.log('3. Add your GEMINI_API_KEY in .env (or use fallback parser)');

    process.exit(0);
  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  }
}

initializeDatabase();
