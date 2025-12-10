FROM ghcr.io/electron/devcontainer:latest

USER root
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get install -y --no-install-recommends libsqlite3-dev \
    && apt-get clean -y && rm -rf /var/lib/apt/lists/*
RUN sed -i '/cd \/workspaces\/gclient\/src\/electron/d' /home/builduser/.bashrc
RUN mkdir -p /home/builduser/app/node_modules \
    && chown -R builduser:builduser /home/builduser/app
USER builduser
ENV ELECTRON_DISABLE_SANDBOX=1 \
    ELECTRON_DISABLE_GPU=1