FROM node:24

WORKDIR /app

# Install dependencies needed for native module compilation (better-sqlite3)
# The Node base image typically includes python3, make, and g++.

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies (including devDependencies to run build scripts)
RUN npm ci

# Copy source code
COPY . .

# Build Frontend and Server
RUN npm run build:web
RUN npm run build:server

# Prune dev dependencies to save space (optional, but keep it simple for now)
RUN npm prune --production
# We need esbuild during build but not runtime. 
# Better-sqlite3 is a dependency.

EXPOSE 3000

ENV NODE_ENV=production

# Define command
CMD ["node", "dist/server/index.js"]
