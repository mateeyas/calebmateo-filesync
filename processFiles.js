const axios = require("axios");
const { initializeLogger } = require('./logHandlers');

// Load environment variables
require("dotenv").config();

const { Client } = require("pg");
const {
  getFileFromSpaces,
  uploadToCloudflareImages,
  uploadToCloudflareStream,
} = require("./fileHandlers");
const { sendNewFilesNotification } = require("./emailHandlers");

// Initialize everything in the main function
(async () => {
  // Initialize the shared pg client
  const pgClient = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  await pgClient.connect();

  // Initialize logger with shared client
  const logger = await initializeLogger(pgClient);

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
      await logger.info('Checking for new files to process');

      // Query for files that haven't been copied to Cloudflare yet
      const result = await pgClient.query(
        'SELECT * FROM "File" WHERE "copiedToCloudflare" = FALSE'
      );

      let processedFileCount = 0;

      for (const file of result.rows) {
        const {
          id,
          fileName,
          fileType,
          path,
          createdAt,
          dateTaken,
          gpsLatitude,
          gpsLongitude,
        } = file;

        // Prepend 'files/' to the path if needed
        const fullPath = `files/${path}`;
        await logger.info(`Processing file`, { id, fullPath });

        if (!fullPath) {
          await logger.error(`Path is undefined for file`, { id });
          continue; // Skip this file if the path is missing
        }

        // Ignore files that are not images or videos
        if (!fileType.startsWith("image/") && !fileType.startsWith("video/")) {
          await logger.info(`Skipping unsupported file type`, { id, fileType });
          continue; // Skip to the next file
        }

        // Download the file from DigitalOcean Spaces as a stream
        const buffer = await getFileFromSpaces(fullPath);

        // Prepare metadata from the file
        const metadata = {
          createdAt: createdAt,
          dateTaken: dateTaken || "Unknown",
          gpsLatitude: gpsLatitude || "Unknown",
          gpsLongitude: gpsLongitude || "Unknown",
        };

        let cloudflareId;

        // Upload the file to Cloudflare based on file type
        if (fileType.startsWith("image/")) {
          // Use buffer for image uploads
          const imageResponse = await retryOperation(() =>
            uploadToCloudflareImages(id, fileName, buffer, fileType, metadata)
          );
          cloudflareId = imageResponse.result.id; // Extract Cloudflare image id

          // Update status to 'ready' after image upload
          await pgClient.query(
            'UPDATE "File" SET "copiedToCloudflare" = TRUE, "cloudflareId" = $2, "status" = $3 WHERE id = $1',
            [id, cloudflareId, "ready"]
          );
        } else if (fileType.startsWith("video/")) {
          // Use buffer for video uploads
          const videoResponse = await retryOperation(() =>
            uploadToCloudflareStream(id, fileName, buffer, fileType, metadata)
          );
          console.log(videoResponse);
          cloudflareId = videoResponse.uid; // Extract Cloudflare video uid

          // Set status to 'pending' after video upload
          await pgClient.query(
            'UPDATE "File" SET "copiedToCloudflare" = TRUE, "cloudflareId" = $2, "status" = $3 WHERE id = $1',
            [id, cloudflareId, "pending"]
          );
        }

        // Increment the processed file count
        processedFileCount++;

        await logger.info(`File processed successfully`, { id });
      }

      // Send email notification if any files were processed
      if (processedFileCount > 0) {
        // Fetch email addresses and names from the User table
        const userResult = await pgClient.query('SELECT email, name FROM "User"');
        const recipients = userResult.rows;
        
        await logger.info('Found recipients for notification', { 
          recipientCount: recipients.length,
          processedFileCount 
        });
        
        if (recipients.length > 0) {
          try {
            const emailResults = await sendNewFilesNotification(logger, recipients, processedFileCount);
            await logger.info('Email notifications completed', { emailResults });
          } catch (error) {
            await logger.error('Failed to send email notifications', { error: error.message });
          }
        } else {
          await logger.info('No active users found for notifications');
        }
      }
    } catch (error) {
      await logger.error('Error processing files', { 
        error: error.message,
        stack: error.stack 
      });
    }
  }

  // Function to poll for video thumbnail and update status
  async function pollPendingVideos() {
    try {
      await logger.info('Fetching pending videos');

      // Query all pending videos
      const pendingVideos = await pgClient.query(
        'SELECT * FROM "File" WHERE "status" = $1',
        ["pending"]
      );

      const maxPollingTime = 2 * 60 * 1000; // 2 minutes
      const pollingInterval = 20 * 1000; // 20 seconds

      const pollingPromises = pendingVideos.rows.map((video) => {
        return new Promise((resolve) => {
          const startTime = Date.now();

          const poll = async () => {
            try {
              const response = await axios.get(
                `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/stream/${video.cloudflareId}`,
                {
                  headers: {
                    Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
                  },
                }
              );

              if (response.data.success) {
                const { thumbnail, status } = response.data.result;

                if (status.state === "ready" && thumbnail) {
                  // Update status to 'ready' and set the thumbnail URL in the database
                  await pgClient.query(
                    'UPDATE "File" SET "status" = $2, "thumbnail" = $3 WHERE id = $1',
                    [video.id, "ready", thumbnail]
                  );
                  await logger.info(`Video thumbnail ready`, { 
                    videoId: video.id,
                    thumbnail 
                  });
                  resolve(); // Stop polling when the video is ready
                } else {
                  // Continue polling for "queued" or "inprogress" or any other status
                  if (Date.now() - startTime < maxPollingTime) {
                    await logger.info(`Video still processing`, { 
                      videoId: video.id,
                      status: status.state 
                    });
                    setTimeout(poll, pollingInterval); // Retry after 20 seconds
                  } else {
                    await logger.warn(`Polling timeout for video`, { videoId: video.id });
                    resolve(); // Stop polling after 2 minutes
                  }
                }
              }
            } catch (error) {
              // If any error occurs, retry until the 2-minute limit is reached
              if (Date.now() - startTime < maxPollingTime) {
                await logger.error(`Error polling video`, { 
                  videoId: video.id,
                  error: error.message 
                });
                setTimeout(poll, pollingInterval); // Retry after 20 seconds
              } else {
                await logger.error(`Polling stopped due to repeated errors`, { 
                  videoId: video.id,
                  error: error.message 
                });
                resolve(); // Stop polling after 2 minutes
              }
            }
          };

          poll(); // Start the polling process
        });
      });

      // Execute all polling processes concurrently
      const results = await Promise.allSettled(pollingPromises);
      await logger.info('Pending videos processing completed', { 
        total: results.length,
        successful: results.filter(r => r.status === 'fulfilled').length,
        failed: results.filter(r => r.status === 'rejected').length
      });

      console.log("All pending videos processed.");
    } catch (error) {
      await logger.error('Error processing pending videos', { 
        error: error.message,
        stack: error.stack 
      });
    }
  }

  try {
    await processNewFiles();
    await pollPendingVideos();
  } finally {
    await pgClient.end(); // Close the database connection after all processing
  }
})();
