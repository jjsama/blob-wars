FROM oven/bun:1.0

WORKDIR /app

# Copy package files
COPY package.json bun.lockb ./

# Install ALL dependencies (including devDependencies) needed for building
RUN bun install

# Copy the rest of the application
COPY . .

# Build the application
RUN bun run build

# Clean up dev dependencies after build
RUN bun install --production

# Expose the port
EXPOSE 3000

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
    CMD curl -f http://localhost:3000/ || exit 1

# Start the server using Bun
CMD ["bun", "run", "server.js"] 