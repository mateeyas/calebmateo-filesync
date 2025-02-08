# File Processing Service for Cloudflare and DigitalOcean Spaces

**Version: 2.0.0**

This repository contains a Node.js service that processes files stored in DigitalOcean Spaces, uploads them to Cloudflare (either to Images or Stream), and updates the metadata stored in a PostgreSQL database. The service handles different file types, such as images and videos, and retries uploads on errors like timeouts.

## Features

- **Fetch Files**: Retrieve files from DigitalOcean Spaces.
- **Upload to Cloudflare**:
  - Images are uploaded to [Cloudflare Images](https://developers.cloudflare.com/images/).
  - Videos are uploaded to [Cloudflare Stream](https://developers.cloudflare.com/stream/).
- **Metadata Management**: Utilize metadata (e.g., date taken, GPS coordinates) stored in a PostgreSQL database.
- **Unique Filenames**: Use the file's unique `id` as the filename in Cloudflare.
- **Error Handling**: Retry uploads on transient errors such as timeouts (HTTP 524) and server errors (HTTP 500, 502, 503, 504).
- **Logging**: Comprehensive logging for both application processes and scheduled tasks.
- **Security**: Secure handling of environment variables and restricted access to Docker functionalities.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Setup](#setup)
3. [Docker Setup](#docker-setup)
4. [Host-Based Cron Setup](#host-based-cron-setup)
5. [Project Structure](#project-structure)
6. [Logging and Monitoring](#logging-and-monitoring)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)
9. [License](#license)
10. [Contact](#contact)

---

## Prerequisites

Before you begin, ensure you have met the following requirements:

- **Operating System**: Linux (e.g., Ubuntu) on your DigitalOcean Droplet.
- **Docker**: Installed and running on your machine. [Install Docker](https://docs.docker.com/get-docker/)
- **Docker Compose**: Installed. [Install Docker Compose](https://docs.docker.com/compose/install/)
- **Git**: Installed on your host machine and Droplet. [Install Git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)
- **SSH Access**: Ability to SSH into your DigitalOcean Droplet.
- **Node.js & pnpm**: While not strictly necessary for the host-based cron setup, ensure your environment is prepared for Node.js development.

---

## Setup

Follow these steps to set up the project on your local machine before deploying to the Droplet.

### 1. Clone the Repository

```sh
git clone https://github.com/yourusername/your-repo-name.git
cd your-repo-name
```

### 2. Create a `.env` File

In the root directory, create a `.env` file to store your environment variables:

```plaintext
DATABASE_URL="postgresql://username:password@hostname:port/database"
SPACES_ENDPOINT="your-digitalocean-spaces-endpoint"
SPACES_KEY="your-digitalocean-spaces-key"
SPACES_SECRET="your-digitalocean-spaces-secret"
SPACES_BUCKET="your-digitalocean-spaces-bucket"
CLOUDFLARE_ACCOUNT_ID="your-cloudflare-account-id"
CLOUDFLARE_API_TOKEN="your-cloudflare-api-token"
PORT=3000
```

**Security Note:** Ensure that the `.env` file is **never** committed to version control. It is included in `.gitignore` to prevent accidental exposure.

### 3. Install `pnpm` (If Not Already Installed)

```sh
npm install -g pnpm
```

### 4. Install Project Dependencies

```sh
pnpm install
```

### 5. Run the Service Locally (Optional)

To test the service locally without Docker:

```sh
pnpm start
```

---

## Docker Setup

Docker is used to containerize the application, ensuring consistency across different environments. Below are the steps to build and run your Docker containers.

### 1. Modify the Dockerfile

Ensure your `Dockerfile` is set up correctly by removing any cron-related configurations and ensuring that `pnpm start` runs a long-lived process (e.g., a server).

**Updated `Dockerfile`:**

```dockerfile
# Use an official Node.js runtime as the base image
FROM node:22-alpine

# Install bash
RUN apk add --no-cache bash

# Install pnpm globally
RUN npm install -g pnpm@9.11.0

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and pnpm-lock.yaml to leverage Docker cache
COPY package.json pnpm-lock.yaml ./

# Install project dependencies
RUN pnpm install --frozen-lockfile

# Copy the rest of the application code
COPY . .

# Ensure the script has execute permissions (if necessary)
RUN chmod +x processFiles.js

# Expose necessary ports
EXPOSE 3000

# Start the application
CMD ["pnpm", "start"]
```

**Changes Made:**

- **Removed `cron` Installation and Configuration:** Eliminates the installation of `cron`, copying of the `crontab` file, and creation of `cron.log`.
- **Updated `CMD`:** The container now starts the Node.js application directly using `pnpm start`, which should run a long-lived process.

### 2. Update `docker-compose.yml`

Ensure your Docker Compose file reflects the removal of internal cron and labels your container for better management.

**Updated `docker-compose.yml`:**

```yaml
version: "3.8"

services:
  calebmateo-filesync:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: calebmateo-filesync
    env_file:
      - .env
    restart: unless-stopped
    labels:
      project: "filesync"
      service: "calebmateo-filesync"
      environment: "production"
      version: "2.1.0"
      maintainer: "Matthias Ragus <matt@tala.dev>"
    ports:
      - "3000:3000" # Expose port if your application serves HTTP requests
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 1m
      timeout: 10s
      retries: 3
```

**Notes:**

- **Service Name & Container Name:** Updated from `filesync-cron` to `calebmateo-filesync`.
- **Labels:** Updated to reflect the new service name.
- **Ports:** Exposed port `3000` if your application serves HTTP requests.
- **Health Check:** Added a health check to monitor the container's health status.

### 3. Build and Run Docker Containers

```sh
docker compose up -d --build
```

**Explanation:**

- **`docker compose up`**: Creates and starts the containers.
- **`-d`**: Runs containers in detached mode (in the background).
- **`--build`**: Forces Docker Compose to rebuild the images before starting the containers.

### 4. Verify Running Containers

```sh
docker compose ps
```

**Expected Output:**

```plaintext
      Name                Command           State    Ports
-------------------------------------------------------------
calebmateo-filesync   pnpm start                     Up      0.0.0.0:3000->3000/tcp
```

### 5. View Container Logs

```sh
docker compose logs -f calebmateo-filesync
```

This command streams the logs from your container in real-time. Ensure that your application is running without errors.

---

## Host-Based Cron Setup

Instead of running `cron` inside the Docker container, you'll set up a **cron job on the host system** (DigitalOcean Droplet) to execute your one-off task every 20 minutes. This approach simplifies your container configuration and avoids permission-related issues.

### 1. Create a Shell Script for the Cron Job

Creating a shell script encapsulates the command logic, making it easier to manage and update.

**a. Create the Script**

On the host machine, create a script named `calebmateo-filesync.sh`.

```bash
nano ~/calebmateo-filesync/calebmateo-filesync.sh
```

**b. Add the Following Content**

```bash
#!/bin/bash

# calebmateo-filesync.sh

# Exit immediately if a command exits with a non-zero status
set -e

# Navigate to the project directory
cd /root/calebmateo-filesync || {
  echo "Failed to navigate to project directory."
  exit 1
}

# Execute the processFiles script inside the Docker container
docker compose exec calebmateo-filesync pnpm run processFiles >> ./logs/cron_host.log 2>&1
```

**c. Make the Script Executable**

```bash
chmod +x ~/calebmateo-filesync/calebmateo-filesync.sh
```

### 2. Update `package.json` to Include a `processFiles` Script

Ensure that your `processFiles.js` can be executed as a one-off task.

**Updated `package.json`:**

```json
{
  "scripts": {
    "start": "node server.js",
    "processFiles": "node processFiles.js --task"
  }
}
```

**Note:** Replace `"node server.js"` with your actual server entry point if different.

### 3. Modify `processFiles.js` to Handle Task Mode

Ensure that `processFiles.js` can distinguish between running as a server and executing a one-off task.

**Updated `processFiles.js`:**

```javascript
// processFiles.js

const { argv } = require("process");

if (argv.includes("--task")) {
  // Execute the file processing task
  processFiles();
} else {
  // Start the server or long-running process
  startServer();
}

function processFiles() {
  console.log("Starting file processing task...");
  // Your file processing logic here

  // Simulate task completion
  setTimeout(() => {
    console.log("File processing task completed.");
    process.exit(0); // Exit after completing the task
  }, 5000);
}

function startServer() {
  const express = require("express");
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.get("/health", (req, res) => {
    res.send("OK");
  });

  const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });

  // Handle graceful shutdown
  process.on("SIGTERM", () => {
    server.close(() => {
      console.log("Process terminated");
    });
  });
}
```

**Explanation:**

- **Task Mode (`--task`):** Runs the file processing task and exits.
- **Server Mode:** Starts the server and keeps the container running.

### 4. Set Up the Cron Job

Edit the crontab for the desired user (e.g., `root`).

```bash
crontab -e
```

**Add the Following Line to Schedule the Task Every 20 Minutes:**

```cron
*/20 * * * * /usr/bin/flock -n /tmp/calebmateo-filesync.lock /root/calebmateo-filesync/calebmateo-filesync.sh >> /root/calebmateo-filesync/logs/cron_host.log 2>&1
```

**Explanation:**

- **`*/20 * * * *`**: Runs the job every 20 minutes.
- **`/usr/bin/flock`**: Ensures only one instance of the script runs at a time.
  - **`-n`**: Non-blocking mode. If a lock exists, skip this run instead of waiting.
  - **`/tmp/calebmateo-filesync.lock`**: Lock file path.
- **`/root/calebmateo-filesync/calebmateo-filesync.sh`**: The absolute path to the shell script.
- **`>> /root/calebmateo-filesync/logs/cron_host.log`**: Appends stdout to the log file.
- **`2>&1`**: Captures stderr in the same log file.

**Alternatively, If Not Using a Shell Script, Add Directly:**

```cron
*/20 * * * * /usr/bin/flock -n /tmp/calebmateo-filesync.lock docker compose -f /root/calebmateo-filesync/docker-compose.yml exec calebmateo-filesync pnpm run processFiles >> /root/calebmateo-filesync/logs/cron_host.log 2>&1
```

**Notes:**

- **Absolute Paths:** Always use absolute paths in cron jobs to avoid issues with environment variables.
- **Logging:** The output is appended to `cron_host.log` for monitoring purposes. Ensure the `logs` directory exists.
- **Lock File:** The lock file prevents multiple instances from running simultaneously, which could cause conflicts.

### 5. Verify the Cron Job

After the cron job runs (wait for at least 20 minutes), verify that the `cron_host.log` is being updated correctly.

```bash
tail -f /root/calebmateo-filesync/logs/cron_host.log
```

**Expected Output:**

```plaintext
Starting file processing task...
File processing task completed.
```

### 6. Ensure Proper Permissions

Ensure that the user running the cron job has the necessary permissions to execute Docker commands.

#### a. Add User to Docker Group (If Not Running as Root)

If you're running the cron job as a non-root user, add the user to the `docker` group to allow execution of Docker commands without `sudo`.

```bash
sudo usermod -aG docker your_username
```

**Apply Group Changes:**

Either log out and log back in or run:

```bash
newgrp docker
```

**Verify Group Membership:**

```bash
groups your_username
```

**Expected Output Includes `docker`:**

```plaintext
your_username : your_username docker
```

**⚠️ Security Note:** Adding a user to the `docker` group grants elevated privileges. Ensure that only trusted users are added.

---

## Project Structure

After implementing the host-based cron setup and renaming the service, your project directory should resemble the following structure:

```
calebmateo-filesync/
├── Dockerfile                   # Docker image configuration
├── docker-compose.yml           # Docker Compose configuration
├── .dockerignore                # Specifies files to exclude from Docker build
├── .gitignore                   # Specifies files to exclude from Git
├── README.md                    # Project documentation
├── .env                         # Environment variables
├── package.json                 # Node.js dependencies and scripts
├── pnpm-lock.yaml               # pnpm lockfile
├── server.js                    # Server entry point
├── processFiles.js              # Main file processing service
├── fileHandlers.js              # Handles file downloads and uploads to Cloudflare
├── calebmateo-filesync.sh        # Shell script for cron job
├── logs/                        # Directory for log files
│   └── cron_host.log            # Log file for cron job
└── ... (other project files)
```

---

## Logging and Monitoring

Proper logging is essential for monitoring the application's execution and troubleshooting any issues.

### 1. Create a Logs Directory

Ensure that the `logs` directory exists to store cron job logs.

```bash
mkdir -p /root/calebmateo-filesync/logs
```

### 2. Configure Log Rotation (Optional but Recommended)

To prevent log files from growing indefinitely, set up log rotation.

#### a. Install `logrotate`

```bash
sudo apt update
sudo apt install logrotate -y
```

#### b. Create a Logrotate Configuration File

```bash
sudo nano /etc/logrotate.d/filesync-cron-host
```

#### c. Add the Following Content

```plaintext
/root/calebmateo-filesync/logs/cron_host.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 root adm
}
```

**Explanation:**

- **`daily`**: Rotates the log file daily.
- **`rotate 14`**: Keeps 14 rotated logs before deleting.
- **`compress`**: Compresses rotated logs.
- **`delaycompress`**: Delays compression to the next rotation cycle.
- **`notifempty`**: Does not rotate empty log files.
- **`create 0640 root adm`**: Creates new log files with specified permissions.

#### d. Test Logrotate Configuration

```bash
sudo logrotate -f /etc/logrotate.d/filesync-cron-host
```

**Verify that the log file is rotated and compressed as expected.**

---

## Best Practices

1. **Secure Docker Socket Access:**

   Granting access to the Docker socket (`/var/run/docker.sock`) allows executing Docker commands from within scripts. Ensure only trusted users have access to this socket.

2. **Use Environment Variables Securely:**

   Keep your `.env` file secure and never commit it to version control. Consider using Docker secrets for enhanced security in production environments.

3. **Monitor Logs Regularly:**

   Regularly check log files to monitor the health and performance of your application and cron jobs.

4. **Automate Deployment (Optional):**

   For frequent updates, consider automating the deployment process using CI/CD tools like GitHub Actions, GitLab CI, or Jenkins.

5. **Backup Critical Data:**

   Regularly back up your project directory and important data to prevent data loss.

---

## Updating the Service

When updates are available in the GitHub repository, follow these steps to update your service:

1. **Navigate to Project Directory**

```bash
cd /root/calebmateo-filesync
```

2. **Pull Latest Changes**

```bash
git pull origin main
```

3. **Rebuild Container Image**

```bash
docker compose build
```

**Notes:**

- Always check the changelog or release notes before updating
- Consider backing up your `.env` file and any custom configurations
- If you've made local changes, you may need to stash or reset them: `git stash` or `git reset --hard origin/main`
- The next scheduled cron job will use the updated container image

---

## Troubleshooting

### 1. Cron Job Not Executing

- **Check Cron Service Status:**

  Ensure the cron service is running on the host.

  ```bash
  sudo service cron status
  ```

  **Start Cron Service If Not Running:**

  ```bash
  sudo service cron start
  ```

- **Verify Crontab Entry:**

  Ensure the cron job is correctly added.

  ```bash
  crontab -l
  ```

- **Check Script Permissions:**

  Ensure the `calebmateo-filesync.sh` script is executable.

  ```bash
  ls -l /root/calebmateo-filesync/calebmateo-filesync.sh
  ```

  **Expected Output:**

  ```plaintext
  -rwxr-xr-x 1 root root  123 Sep 30 10:00 calebmateo-filesync.sh
  ```

### 2. Docker Command Fails in Cron Job

- **Ensure User Permissions:**

  The user running the cron job must have permissions to execute Docker commands. If not running as `root`, ensure the user is part of the `docker` group.

  ```bash
  sudo usermod -aG docker your_username
  newgrp docker
  ```

- **Absolute Paths in Cron Job:**

  Ensure all paths in the cron job are absolute to avoid path-related issues.

### 3. Logs Not Being Written

- **Check Log Directory Exists:**

  Ensure the `logs` directory exists and has appropriate permissions.

  ```bash
  ls -ld /root/calebmateo-filesync/logs
  ```

  **Create If Missing:**

  ```bash
  mkdir -p /root/calebmateo-filesync/logs
  ```

- **Verify Log File Permissions:**

  Ensure the log file is writable.

  ```bash
  touch /root/calebmateo-filesync/logs/cron_host.log
  chmod 644 /root/calebmateo-filesync/logs/cron_host.log
  ```

### 4. Application Not Processing Files as Expected

- **Check Application Logs:**

  Review the log file to identify any errors during execution.

  ```bash
  tail -f /root/calebmateo-filesync/logs/cron_host.log
  ```

- **Test Command Manually:**

  Execute the command manually to ensure it works outside of cron.

  ```bash
  /root/calebmateo-filesync/calebmateo-filesync.sh
  ```

  **Check Logs for Successful Execution.**

### 5. Environment Variables Not Loaded

- **Verify `.env` File Location:**

  Ensure that the `.env` file is present in the project directory on the Droplet.

- **Check `env_file` Reference:**

  Ensure that the `env_file` directive in `docker-compose.yml` correctly references the `.env` file.

  ```yaml
  env_file:
    - .env
  ```

- **Inspect Container Environment Variables:**

  ```bash
  docker compose exec calebmateo-filesync env
  ```

  Verify that all necessary environment variables are present.

---

## License

This project is licensed under the [MIT License](LICENSE).

---

## Contact

This project is maintained by **Tala Dev**. If you have any questions or suggestions, feel free to reach out.

**Matthias Ragus**  
Email: [matt@tala.dev](mailto:matt@tala.dev)

---

## Additional Resources

- **Docker Documentation:**
  - [Docker Compose Overview](https://docs.docker.com/compose/)
  - [Best Practices for Writing Dockerfiles](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/)
- **Cron Documentation:**
  - [Cron How-To](https://help.ubuntu.com/community/CronHowto)
- **Node.js Documentation:**
  - [pnpm Documentation](https://pnpm.io/)
- **DigitalOcean Documentation:**
  - [How To Use Docker](https://www.digitalocean.com/community/tutorials/how-to-install-and-use-docker-on-ubuntu-20-04)
  - [How To Install Docker Compose](https://www.digitalocean.com/community/tutorials/how-to-install-docker-compose-on-ubuntu-20-04)
  - [Securing Your Droplet](https://www.digitalocean.com/docs/security/)
