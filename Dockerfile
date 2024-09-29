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

# Expose any necessary ports (if your app requires it)
# EXPOSE 3000

# Start the application
CMD ["pnpm", "start"]
