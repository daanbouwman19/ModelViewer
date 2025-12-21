# Stage 1: Build assets
FROM node:24 AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install ALL dependencies for building
RUN npm ci

# Copy source code
COPY . .

# Build Frontend and Server
RUN npm run build:web
RUN npm run build:server

# Stage 2: Install production dependencies
# We use the full node:24 image to ensure native modules like better-sqlite3 are correctly built
FROM node:24 AS prod-deps

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Remove husky prepare script to prevent failures during production-only install
# Husky is a devDependency and won't be available here.
RUN npm pkg delete scripts.prepare

# Install ONLY production dependencies
RUN npm ci --omit=dev

# Stage 3: Final Runtime
FROM node:24-slim AS runtime

# Create a non-root user and group for security
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 appuser

WORKDIR /app

# Copy only the necessary runtime artifacts from previous stages
COPY --from=builder --chown=appuser:nodejs /app/dist ./dist
COPY --from=prod-deps --chown=appuser:nodejs /app/node_modules ./node_modules
COPY --from=prod-deps --chown=appuser:nodejs /app/package.json ./package.json

# Ensure the app has write permissions for the database and cache
RUN mkdir -p /app/cache && chown -R appuser:nodejs /app

# Expose the application port
EXPOSE 3000

ENV NODE_ENV=production

# Switch to the non-root user
USER appuser

# Define command
CMD ["node", "dist/server/index.js"]
