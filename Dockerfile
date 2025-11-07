# Use Debian-based Node image for Electron compatibility
FROM node:lts-bullseye

# Install Electron runtime dependencies
RUN apt-get update && apt-get install -y \
    libgtk-3-0 \
    libnotify4 \
    libnss3 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    libatspi2.0-0 \
    libdrm2 \
    libgbm1 \
    libxcb-dri3-0 \
    libgl1-mesa-glx \
    libegl1-mesa \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

COPY . .
RUN chown -R node:node /app

USER node

CMD ["sleep", "infinity"]