const { Client } = require("minio");
const axios = require("axios");
const FormData = require("form-data");
const tus = require("tus-js-client");

// Initialize the Minio client for DigitalOcean Spaces
const minioClient = new Client({
  endPoint: process.env.SPACES_ENDPOINT,
  accessKey: process.env.SPACES_KEY,
  secretKey: process.env.SPACES_SECRET,
  useSSL: true,
});

// Function to download the file from DigitalOcean Spaces
async function getFileFromSpaces(filePath) {
  const bucket = process.env.SPACES_BUCKET;

  return new Promise((resolve, reject) => {
    let data = [];

    minioClient.getObject(bucket, filePath, (err, stream) => {
      if (err) return reject(err);

      // Handle the stream of data
      stream.on("data", (chunk) => data.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(data))); // Return the full file as a buffer
      stream.on("error", reject);
    });
  });
}

// Function to upload an image to Cloudflare Images
async function uploadToCloudflareImages(
  id,
  fileName,
  fileContent,
  fileType,
  metadata
) {
  const formData = new FormData();

  // Add file content with correct content type
  formData.append("file", fileContent, {
    filename: id,
    contentType: fileType,
  });

  // Add metadata
  formData.append(
    "metadata",
    JSON.stringify({
      project: "calebmateo",
      originalFileName: fileName,
      dateTaken: metadata?.dateTaken || "Unknown",
      gpsLatitude: metadata?.gpsLatitude || "Unknown",
      gpsLongitude: metadata?.gpsLongitude || "Unknown",
    })
  );

  // Upload to Cloudflare Images API
  try {
    const response = await axios.post(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/images/v1`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
          ...formData.getHeaders(),
        },
      }
    );
    console.log(`File ${id} uploaded successfully to Cloudflare Images.`);
    return response.data;
  } catch (error) {
    console.error("Error uploading to Cloudflare Images:", error);
    throw error;
  }
}

// Function to upload a video to Cloudflare Stream using TUS with the stream directly
async function uploadToCloudflareStream(
  id,
  fileName,
  fileContent,
  fileType,
  metadata
) {
  const size = fileContent.length; // Get buffer size

  return new Promise((resolve, reject) => {
    // Configure TUS upload
    const options = {
      endpoint: `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/stream`,
      headers: {
        Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
      },
      chunkSize: 50 * 1024 * 1024, // Minimum chunk size of 5 MB, using 50 MB
      retryDelays: [0, 3000, 5000, 10000, 20000],
      uploadSize: size,
      metadata: {
        name: id,
        filetype: fileType,
        project: "calebmateo",
        originalFileName: fileName,
        dateTaken: metadata?.dateTaken || "Unknown",
        gpsLatitude: metadata?.GPSLatitude || "Unknown",
        gpsLongitude: metadata?.GPSLongitude || "Unknown",
      },
      onError: function (error) {
        console.error("Failed to upload video:", error);
        reject(error);
      },
      onProgress: function (bytesUploaded, bytesTotal) {
        const percentage = ((bytesUploaded / bytesTotal) * 100).toFixed(2);
        console.log(
          `Progress: ${percentage}% (${bytesUploaded} of ${bytesTotal})`
        );
      },
      onSuccess: function () {
        // Extract the uid from the upload URL and remove the query string
        const uidWithParams = upload.url.split("/").pop();
        const uid = uidWithParams.split("?")[0]; // Remove the query string

        console.log(
          `Video upload to Cloudflare Stream completed successfully. (uid: ${uid})`
        );
        resolve({ uid }); // Return the cleaned uid
      },
    };

    // Start the upload using tus-js-client
    const upload = new tus.Upload(fileContent, options);
    upload.start();
  });
}

module.exports = {
  getFileFromSpaces,
  uploadToCloudflareImages,
  uploadToCloudflareStream,
};
