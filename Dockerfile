FROM oven/bun:1.0

WORKDIR /app

# Copy package files
COPY package.json bun.lockb ./

# Install dependencies
RUN bun install

# Copy the rest of the application
COPY . .

# Build the application
RUN bun run build

# Expose the port
EXPOSE 3000

# Start the server
CMD ["bun", "run", "server.js"] 