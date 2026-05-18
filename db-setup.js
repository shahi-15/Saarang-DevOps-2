import pg from 'pg';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is not set in environment variables.');
  process.exit(1);
}

// Parse database name from connection string
const dbNameMatch = connectionString.match(/\/([^/?]+)(\?|$)/);
const dbName = dbNameMatch ? dbNameMatch[1] : 'saarang_ecommerce';

const isCloudDb = connectionString.includes('supabase.co') ||
  connectionString.includes('neon.tech') ||
  connectionString.includes('render.com') ||
  connectionString.includes('aws');
const sslConfig = isCloudDb ? { rejectUnauthorized: false } : false;

async function setupDatabase() {
  console.log(`Starting database setup for '${dbName}'...`);

  // Step 1: Connect to the 'postgres' default database to check/create the target database
  const postgresDbUrl = connectionString.replace(/\/([^/?]+)(\?|$)/, '/postgres$2');
  const tempPool = new pg.Pool({ connectionString: postgresDbUrl, ssl: sslConfig });

  try {
    const checkDbResult = await tempPool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbName]
    );

    if (checkDbResult.rowCount === 0) {
      console.log(`Database '${dbName}' does not exist. Creating it...`);
      // CREATE DATABASE cannot run inside a transaction block or with active connections to it
      await tempPool.query(`CREATE DATABASE "${dbName}"`);
      console.log(`Database '${dbName}' created successfully.`);
    } else {
      console.log(`Database '${dbName}' already exists.`);
    }
  } catch (err) {
    console.error('Error checking/creating database:', err.message);
  } finally {
    await tempPool.end();
  }

  // Step 2: Connect directly to our target database and run schema.sql
  const pool = new pg.Pool({ connectionString, ssl: sslConfig });

  try {
    const sqlPath = path.resolve('schema.sql');
    if (!fs.existsSync(sqlPath)) {
      throw new Error(`schema.sql not found at ${sqlPath}`);
    }

    console.log('Reading schema.sql...');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Executing schema.sql to initialize tables...');
    await pool.query(sql);
    console.log('Tables initialized successfully.');

    // Step 3: Seed Administrator
    console.log('Seeding default administrator account...');
    const adminUsername = 'Shahid';
    const adminPassword = 'saarang123';
    const adminHash = await bcrypt.hash(adminPassword, 10);

    await pool.query(
      `INSERT INTO users (username, password_hash, role) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (username) DO NOTHING`,
      [adminUsername, adminHash, 'admin']
    );
    console.log(`- Created admin user: "${adminUsername}" with password: "${adminPassword}" (role: admin)`);

    // Step 4: Seed normal user
    console.log('Seeding default customer account...');
    const userUsername = 'Cristiano';
    const userPassword = 'Ronaldosiu';
    const userHash = await bcrypt.hash(userPassword, 10);
    
    await pool.query(
      `INSERT INTO users (username, password_hash, role) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (username) DO NOTHING`,
      [userUsername, userHash, 'user']
    );
    console.log(`- Created customer user: "${userUsername}" with password: "${userPassword}" (role: user)`);

    // Step 5: Seed initial products
    console.log('Seeding initial product inventory...');
    const products = [
      { name: 'UltraBook Pro 15', description: 'Powerful developer laptop with 32GB RAM, 1TB SSD, and M3 chip.', price: 1499.99, stock: 25 },
      { name: 'SmartPhone X1', description: 'Next-gen smartphone with 120Hz OLED screen and pro camera array.', price: 899.50, stock: 40 },
      { name: 'NoiseCanceling Headphones H2', description: 'Active noise-canceling over-ear headphones with 40-hour battery life.', price: 249.99, stock: 15 },
      { name: 'Mechanical Keyboard RGB', description: 'Hot-swappable tactile keyboard with premium aluminum housing.', price: 129.00, stock: 50 },
      { name: 'Smart Watch Fit', description: 'Fitness tracker and smartwatch with continuous heart rate monitor.', price: 199.95, stock: 0 } // Out of stock to test failure flow!
    ];

    for (const prod of products) {
      await pool.query(
        `INSERT INTO products (name, description, price, stock) 
         VALUES ($1, $2, $3, $4)`,
        [prod.name, prod.description, prod.price, prod.stock]
      );
    }
    console.log(`- Successfully seeded ${products.length} products.`);
    console.log('\nDatabase setup completed successfully! Feel free to run npm run dev to start the server.');

  } catch (err) {
    console.error('Database setup failed:', err);
  } finally {
    await pool.end();
  }
}

setupDatabase();
