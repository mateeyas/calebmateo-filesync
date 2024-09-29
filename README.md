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

2. **Create a `.env` file** in the root directory and add your environment variables:

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

## Docker Setup

To simplify deployment and ensure consistency across different environments, Docker is used to containerize the application. Additionally, a cron job is configured within the Docker container to run the file processing script every 10 minutes.

### **Prerequisites**

- **Docker**: Ensure Docker is installed on your machine. [Install Docker](https://docs.docker.com/get-docker/)
- **Docker Compose**: Ensure Docker Compose is installed. [Install Docker Compose](https://docs.docker.com/compose/install/)

### **Project Structure with Docker**

```
calebmateo-filesync/
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── .gitignore
├── crontab
├── README.md
├── .env
├── package.json
├── pnpm-lock.yaml
├── processFiles.js
├── fileHandlers.js
└── ... (other project files)
```

### **Docker Configuration Files**

- **Dockerfile**: Defines the Docker image configuration.
- **docker-compose.yml**: Manages multi-container Docker applications.
- **crontab**: Configures the cron job inside the Docker container.
- **.dockerignore**: Specifies files to exclude from the Docker build context.
- **.gitignore**: Ensures sensitive and unnecessary files are not tracked by Git.

### **1. Building the Docker Image**

Navigate to your project directory and build the Docker image using Docker Compose:

```sh
docker compose build
```

**Explanation:**

- **`docker compose build`**: Builds the Docker image as defined in the `docker-compose.yml` file.

### **2. Running the Docker Container**

After building the image, start the container using Docker Compose:

```sh
docker compose up -d
```

**Explanation:**

- **`docker compose up`**: Creates and starts the containers.
- **`-d`**: Runs containers in detached mode (in the background).

### **3. Managing the Docker Container**

- **Stop the Container**:

    ```sh
    docker compose down
    ```

- **Rebuild and Restart After Changes**:

    If you make changes to your `Dockerfile`, `docker-compose.yml`, or application code, rebuild and restart:

    ```sh
    docker compose up -d --build
    ```

- **View Logs**:

    - **Cron Logs**:

        ```sh
        tail -f ./logs/cron.log
        ```

    - **Container Logs**:

        ```sh
        docker compose logs -f
        ```

- **Access the Container Shell**:

    For debugging purposes, you can access the container's shell:

    ```sh
    docker compose exec filesync-cron sh
    ```

### **4. Environment Variables**

Environment variables are managed using the `.env` file and referenced in the `docker-compose.yml`. Ensure your `.env` file is correctly set up as described in the **Setup** section.

**Security Note:** The `.env` file is excluded from version control via `.gitignore` to protect sensitive information.

### **5. Cron Job Configuration**

A cron job is configured within the Docker container to execute the `processFiles.js` script every 10 minutes. This is handled by the `crontab` file and the Docker setup.

**Crontab Entry:**

```cron
# Run every 10 minutes
*/10 * * * * cd /usr/src/app && pnpm start >> /var/log/cron.log 2>&1
```

**Explanation:**

- **`*/10 * * * *`**: Schedules the job to run every 10 minutes.
- **`cd /usr/src/app`**: Navigates to the application directory inside the Docker container.
- **`pnpm start`**: Executes the `start` script defined in `package.json`.
- **`>> /var/log/cron.log 2>&1`**: Redirects both stdout and stderr to a log file for debugging purposes.

### **6. Volume Mounting for Logs**

Logs generated by the cron job are persisted on the host machine through volume mounting. This ensures that log data is not lost when the container stops or restarts.

**Docker Compose Volume Configuration:**

```yaml
volumes:
  - ./logs:/var/log
```

**Explanation:**

- **`./logs`**: Directory on the host machine where logs will be stored.
- **`/var/log`**: Directory inside the Docker container where logs are written.

### **7. Rebuilding and Updating the Docker Container**

Whenever you update your application code or dependencies, rebuild the Docker image and restart the container to apply changes.

```sh
docker compose up -d --build
```

**Explanation:**

- **`--build`**: Forces Docker Compose to rebuild the images before starting the containers.

### **8. Cleaning Up Docker Resources**

To remove stopped containers, networks, images, and optionally, volumes:

```sh
docker compose down --volumes --remove-orphans
```

**Explanation:**

- **`--volumes`**: Removes named volumes declared in the `volumes` section of the `docker-compose.yml` file.
- **`--remove-orphans`**: Removes containers for services not defined in the `docker-compose.yml`.

## Project Structure

```
.
├── fileHandlers.js              # Handles file downloads and uploads to Cloudflare
├── processFiles.js              # Main file processing service
├── Dockerfile                   # Docker image configuration
├── docker-compose.yml           # Docker Compose configuration
├── crontab                      # Cron job configuration
├── .dockerignore                # Specifies files to exclude from Docker build
├── .gitignore                   # Specifies files to exclude from Git
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

## Docker Compose Commands

For ease of management, here are some useful Docker Compose commands tailored to this project:

- **Build the Docker Image**:

    ```sh
    docker compose build
    ```

- **Start the Docker Container**:

    ```sh
    docker compose up -d
    ```

- **Stop the Docker Container**:

    ```sh
    docker compose down
    ```

- **View Logs**:

    ```sh
    docker compose logs -f
    ```

- **Rebuild and Restart the Container After Changes**:

    ```sh
    docker compose up -d --build
    ```

- **Access the Container's Shell**:

    ```sh
    docker compose exec filesync-cron sh
    ```

- **Remove All Docker Containers, Networks, and Volumes**:

    ```sh
    docker compose down --volumes --remove-orphans
    ```

## Docker Compose File (`docker-compose.yml`)

For reference, here is the `docker-compose.yml` file used in this setup:

```yaml
services:
  filesync-cron:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: filesync-cron
    env_file:
      - .env
    volumes:
      - ./logs:/var/log
    restart: unless-stopped
```

**Explanation of Entries:**

- **`services`**: Defines the services (containers) to be run.
  - **`filesync-cron`**: The name of your service.
    - **`build`**:
      - **`context: .`**: Sets the build context to the current directory.
      - **`dockerfile: Dockerfile`**: Specifies the Dockerfile to use.
    - **`container_name: filesync-cron`**: Names the container for easier reference.
    - **`env_file`**:
      - **`- .env`**: Specifies the `.env` file to load environment variables from.
    - **`volumes`**:
      - **`- ./logs:/var/log`**: Mounts the host's `./logs` directory to the container's `/var/log` directory.
    - **`restart: unless-stopped`**: Ensures the container restarts automatically unless explicitly stopped.

## License

This project is licensed under the MIT License.

## Contact

This project is maintained by Tala Dev. If you have any questions or suggestions, feel free to reach out.

Matthias Ragus ([matt@tala.dev](mailto:matt@tala.dev))
