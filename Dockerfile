FROM oven/bun:1.0

WORKDIR /app

# Copy package management files
COPY package*.json bun.lockb ./

# Copy all configuration files needed for build
COPY tsconfig.json vite.config.js ./

# Install ALL dependencies (including devDependencies) needed for building
RUN bun install

# Copy source files and public assets
COPY src/ ./src/
COPY public/ ./public/
COPY index.html ./
COPY styles.css ./
COPY index.ts ./

# Build the application
RUN bun run build

# Clean up dev dependencies after build
RUN bun install --production

# Expose the port
EXPOSE 3000

# Copy server files
COPY server.js ./

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
    CMD curl -f http://localhost:3000/ || exit 1

# Start the server using Bun
CMD ["bun", "run", "server.js"] 