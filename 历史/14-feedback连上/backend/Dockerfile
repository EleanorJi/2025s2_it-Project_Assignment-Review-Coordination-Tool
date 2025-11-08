# Use official Node.js runtime as base image
FROM node:18-alpine

# Set working directory in container
WORKDIR /app

# Copy package files
COPY ./backend/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY ./backend/src/ ./src/

# Copy frontend files for serving HTML pages (needed for route hiding)
COPY ./frontend/ ./frontend/

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Create uploads directory and set permissions
RUN mkdir -p /app/uploads /app/temp_uploads && chown -R nodejs:nodejs /app

# Change to nodejs user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start the application
CMD ["node", "src/app.js"]
