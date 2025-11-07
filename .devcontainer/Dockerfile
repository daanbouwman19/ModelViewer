FROM node:24

# Install dependencies
RUN apt-get update && apt-get install -y \
    libx11-dev \
    libx11-xcb-dev \
    libxtst-dev \
    libnss3-dev \
    libgtk-3-dev \
    libgdk-pixbuf2.0-dev \
    libgconf-2-4 \
    libasound2-dev \
    libxss-dev

WORKDIR /workspace
