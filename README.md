# File Processing Service for Cloudflare and DigitalOcean Spaces

**Version: 1.0.0**

This repository contains a Node.js service that processes files stored in DigitalOcean Spaces, uploads them to Cloudflare (either to Images or Stream), and updates the metadata stored in a PostgreSQL database. The service handles different file types, such as images and videos, and retries uploads on errors like timeouts.

## Features

- Fetch files from DigitalOcean Spaces.
- Upload images to Cloudflare Images and videos to Cloudflare Stream.
- Fetch and use metadata (e.g., date taken, GPS coordinates) directly from a PostgreSQL database.
- Use the file's unique `id` as the filename in Cloudflare.
- Handle different file types (images and videos) and ignore unsupported types.
- Retry uploads on transient errors such as timeouts (HTTP 524) and server errors (HTTP 500, 502, 503, 504).

## Setup

To set up the project, follow these steps:

1. **Clone the repository**:

    ```sh
    git clone https://github.com/yourusername/your-repo-name.git
    cd your-repo-name
    ```

2. **Create a `.env` file** in the root directory and add your environment variables**:

    ```plaintext
    DATABASE_URL="postgresql://username:password@hostname:port/database"
    SPACES_ENDPOINT="your-digitalocean-spaces-endpoint"
    SPACES_KEY="your-digitalocean-spaces-key"
    SPACES_SECRET="your-digitalocean-spaces-secret"
    SPACES_BUCKET="your-digitalocean-spaces-bucket"
    CLOUDFLARE_ACCOUNT_ID="your-cloudflare-account-id"
    CLOUDFLARE_API_TOKEN="your-cloudflare-api-token"
    ```

3. **Install `pnpm` if you don't have it already**:

    ```sh
    npm install -g pnpm
    ```

4. **Install project dependencies using `pnpm`**:

    ```sh
    pnpm install
    ```

5. **Run the service**:

    You can run the service with:

    ```sh
    pnpm start
    ```

## Project Structure

```
.
├── fileHandlers.js              # Handles file downloads and uploads to Cloudflare
├── processFiles.js              # Main file processing service
├── .env                         # Environment variables
├── package.json                 # Node.js dependencies and scripts
├── pnpm-lock.yaml               # pnpm lockfile
└── README.md                    # Project documentation
```

## Usage

The service processes files that haven't been copied to Cloudflare yet, as determined by the `copiedToCloudflare` column in the `File` table. 

### Process Flow:

1. **File retrieval**: The service fetches files from DigitalOcean Spaces using the file path stored in the database.
2. **Metadata retrieval**: Metadata such as `dateTaken` and `gpsCoordinates` is fetched directly from the database.
3. **Upload to Cloudflare**: 
    - For images, the file is uploaded to Cloudflare Images.
    - For videos, the file is uploaded to Cloudflare Stream using TUS protocol.
4. **Mark as copied**: Once the upload is successful, the file is marked as copied in the database.

### Error Handling

- **524 (Timeout)**: Automatically retries the upload.
- **429 (Too Many Requests)**: Retries respecting the `Retry-After` header.
- **500, 502, 503, 504 (Server Errors)**: Retries with exponential backoff.

## License

This project is licensed under the MIT License.

## Contact

This project is maintained by Tala Dev. If you have any questions or suggestions, feel free to reach out.

Matthias Ragus ([matt@tala.dev](mailto:matt@tala.dev))
