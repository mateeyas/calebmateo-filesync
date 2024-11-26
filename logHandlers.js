const { Client } = require("pg");

// PostgreSQL client setup
const pgClient = new Client({
  connectionString: process.env.DATABASE_URL,
});

pgClient.connect();

async function logToDatabase(level, message, metadata = {}) {
  try {
    const query = `
      INSERT INTO "Log" ("level", "message", "metadata", "timestamp")
      VALUES ($1, $2, $3, NOW())
      RETURNING *
    `;
    
    const result = await pgClient.query(query, [
      level,
      message,
      JSON.stringify(metadata)
    ]);
    
    return result.rows[0];
  } catch (error) {
    // Fallback to console if database logging fails
    console.error('Failed to write to log database:', error);
    console.error('Original log:', { level, message, metadata });
  }
}

// Convenience methods for different log levels
const logger = {
  error: (message, metadata) => logToDatabase('error', message, metadata),
  warn: (message, metadata) => logToDatabase('warn', message, metadata),
  info: (message, metadata) => logToDatabase('info', message, metadata),
  debug: (message, metadata) => logToDatabase('debug', message, metadata)
};

module.exports = {
  logger
}; 