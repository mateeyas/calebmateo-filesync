# Use an official Node.js runtime as the base image
FROM node:22-alpine

# Install dependencies required for cron
RUN apk add --no-cache dcron bash

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

# Copy the crontab file to the cron directory
COPY crontab /etc/crontabs/root

# Ensure the crontab file has the correct permissions
RUN chmod 0644 /etc/crontabs/root

# Create a log file for cron jobs
RUN mkdir -p /var/log && touch /var/log/cron.log

# Ensure the script has execute permissions (if necessary)
RUN chmod +x processFiles.js

# Expose any necessary ports (if your app requires it)
# EXPOSE 3000

# Start the cron daemon in the foreground
CMD ["crond", "-f", "-l", "2"]
