FROM ghcr.io/electron/devcontainer:latest

WORKDIR /home/builduser/app

# Copy package files and install dependencies
COPY --chown=builduser:builduser package*.json ./
USER builduser
RUN npm ci

# Copy application source
COPY --chown=builduser:builduser . .
