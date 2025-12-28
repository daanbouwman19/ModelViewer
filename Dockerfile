# Stage 1: Build assets
FROM node:25 AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Skip heavy Electron binary download for the builder
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1

# Install ALL dependencies for building
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Copy source code
COPY . .

# Build Frontend and Server
RUN npm run build:web:fast
RUN npm run build:server

# Stage 2: Install production dependencies
# We use the full node:25 image to ensure native modules like better-sqlite3 are correctly built
FROM node:25 AS prod-deps

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install ONLY production dependencies, ignoring scripts (like husky)
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts

# Stage 3: Final Runtime
FROM node:25-slim AS runtime

# Create a non-root user and group for security
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 appuser

WORKDIR /app

# Copy only the necessary runtime artifacts from previous stages
COPY --from=builder --chown=appuser:nodejs /app/dist ./dist
COPY --from=prod-deps --chown=appuser:nodejs /app/node_modules ./node_modules
COPY --from=prod-deps --chown=appuser:nodejs /app/package.json ./package.json

# Ensure the app has write permissions for the database and cache
RUN mkdir -p /app/cache && chown appuser:nodejs /app /app/cache

# Expose the application port
EXPOSE 3000

ENV NODE_ENV=production

# Switch to the non-root user
USER appuser

# Define command
CMD ["node", "dist/server/index.js"]
