import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('CRITICAL: DATABASE_URL environment variable is not defined.');
  process.exit(1);
}

const isCloudDb = connectionString.includes('supabase.co') || 
                  connectionString.includes('neon.tech') || 
                  connectionString.includes('render.com') || 
                  connectionString.includes('aws');

const pool = new Pool({
  connectionString,
  ssl: isCloudDb || process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test connection on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error acquiring client from pool:', err.stack);
  } else {
    client.query('SELECT NOW()', (err, result) => {
      release();
      if (err) {
        return console.error('Error executing query during startup test:', err.stack);
      }
      console.log('Successfully connected to the PostgreSQL database.');
    });
  }
});

export default {
  /**
   * Execute a SQL query
   * @param {string} text - SQL Query text
   * @param {Array} params - Query parameters
   * @returns {Promise<pg.QueryResult>}
   */
  query: (text, params) => {
    // Log queries in development for easy debugging
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[SQL EXEC]: ${text.trim().replace(/\s+/g, ' ')} | Params:`, params || []);
    }
    return pool.query(text, params);
  },
  
  /**
   * Get a client from the pool (useful for transactions)
   * @returns {Promise<pg.PoolClient>}
   */
  getClient: () => pool.connect(),
  
  pool
};
