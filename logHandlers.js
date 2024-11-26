const { Client } = require("pg");

// Export a function to initialize the logger with a shared client
async function initializeLogger(sharedPgClient) {
  async function logToDatabase(level, message, metadata = {}) {
    try {
      const query = `
        INSERT INTO "Log" ("level", "message", "metadata", "timestamp")
        VALUES ($1, $2, $3, NOW())
        RETURNING *
      `;
      
      const result = await sharedPgClient.query(query, [
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

  // Return logger instance with the shared client
  return {
    error: (message, metadata) => logToDatabase('error', message, metadata),
    warn: (message, metadata) => logToDatabase('warn', message, metadata),
    info: (message, metadata) => logToDatabase('info', message, metadata),
    debug: (message, metadata) => logToDatabase('debug', message, metadata)
  };
}

module.exports = {
  initializeLogger
}; 