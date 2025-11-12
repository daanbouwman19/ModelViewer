FROM ghcr.io/electron/devcontainer:latest

# Set working directory
WORKDIR /home/builduser/app

# Copy package files
COPY --chown=builduser:builduser package*.json ./

# Install dependencies as builduser
USER builduser
RUN --mount=type=cache,target=/home/builduser/.npm \
    npm install

# Switch back to builduser for runtime
USER builduser

# Set environment variables for Electron
ENV DISPLAY=:0 \
    ELECTRON_DISABLE_SANDBOX=1 \
    DBUS_SESSION_BUS_ADDRESS=autolaunch:
