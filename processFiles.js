// Load environment variables
require("dotenv").config();

const { Client } = require("pg");
const {
  getFileFromSpaces,
  uploadToCloudflareImages,
  uploadToCloudflareStream,
} = require("./fileHandlers");

// PostgreSQL client setup
const pgClient = new Client({
  connectionString: process.env.DATABASE_URL,
});

pgClient.connect();

console.log("File processing service started and running...");

// Function to retry an operation in case of specific errors
async function retryOperation(operation, retries = 3, delay = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await operation(); // Try the operation
    } catch (error) {
      const statusCode = error.response?.status;

      // Retry only for specific error codes
      if (
        attempt === retries ||
        ![524, 429, 500, 502, 503, 504].includes(statusCode)
      ) {
        // If it's the last attempt or the error is not retryable, throw the error
        throw error;
      }

      const retryAfter = error.response?.headers["retry-after"] || delay; // Respect `Retry-After` if present

      console.warn(
        `Error ${statusCode} occurred, retrying in ${retryAfter}ms... (Attempt ${attempt}/${retries})`
      );
      await new Promise((resolve) => setTimeout(resolve, retryAfter)); // Wait before retrying
    }
  }
}

// Function to process new files
async function processNewFiles() {
  try {
    console.log("Checking for new files to process...");

    // Query for files that haven't been copied to Cloudflare yet
    const result = await pgClient.query(
      'SELECT * FROM "File" WHERE "copiedToCloudflare" = FALSE'
    );

    for (const file of result.rows) {
      const {
        id,
        fileName,
        fileType,
        path,
        dateTaken,
        gpsLatitude,
        gpsLongitude,
      } = file;

      // Prepend 'files/' to the path if needed
      const fullPath = `files/${path}`;
      console.log(`Processing file: ${id}, fullPath: ${fullPath}`);

      if (!fullPath) {
        console.error(`Error: path is undefined for file ${id}`);
        continue; // Skip this file if the path is missing
      }

      // Ignore files that are not images or videos
      if (!fileType.startsWith("image/") && !fileType.startsWith("video/")) {
        console.log(`Skipping file: ${id}. Unsupported file type: ${fileType}`);
        continue; // Skip to the next file
      }

      // Download the file from DigitalOcean Spaces as a stream
      const buffer = await getFileFromSpaces(fullPath);

      // Prepare metadata from the file
      const metadata = {
        dateTaken: dateTaken || "Unknown",
        gpsLatitude: gpsLatitude || "Unknown",
        gpsLongitude: gpsLongitude || "Unknown",
      };

      // Upload the file to Cloudflare based on file type
      if (fileType.startsWith("image/")) {
        // Use buffer for image uploads
        await retryOperation(() =>
          uploadToCloudflareImages(id, fileName, buffer, fileType, metadata)
        );
      } else if (fileType.startsWith("video/")) {
        // Use buffer for video uploads
        await retryOperation(() =>
          uploadToCloudflareStream(id, fileName, buffer, fileType, metadata)
        );
      }

      // Mark the file as copied in the database
      await pgClient.query(
        'UPDATE "File" SET "copiedToCloudflare" = TRUE WHERE id = $1',
        [id]
      );

      console.log(`File ${id} processed successfully.`);
    }
  } catch (error) {
    console.error("Error processing files:", error);
  } finally {
    await pgClient.end(); // Close the database connection after processing
  }
}

// Start the file processing
processNewFiles();
