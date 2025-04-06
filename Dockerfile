FROM node:18 as builder

WORKDIR /app

# Copy package management files
COPY package*.json ./

# Install dependencies for build
RUN npm install

# Copy all files needed for build
COPY . .

# Build the application
RUN npm run build

# Start fresh with Bun runtime
FROM oven/bun:1.0

WORKDIR /app

# Copy built files and necessary runtime files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.js ./
COPY package*.json bun.lockb ./

# Install only production dependencies
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