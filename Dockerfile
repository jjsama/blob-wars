FROM oven/bun:1.0

WORKDIR /app

# Copy package files
COPY package.json .
COPY bun.lockb .

# Install dependencies
RUN bun install

# Copy the rest of the application
COPY . .

# Build the application
RUN bun run build

# Expose the port
EXPOSE 8080

# Start the server
CMD ["bun", "run", "start"] 