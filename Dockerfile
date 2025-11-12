FROM ghcr.io/electron/devcontainer:latest

WORKDIR /home/builduser/app

# Copy package files and install dependencies
COPY --chown=builduser:builduser package*.json ./
USER builduser
RUN --mount=type=cache,target=/root/.npm npm install

# Copy application source
COPY --chown=builduser:builduser . .
