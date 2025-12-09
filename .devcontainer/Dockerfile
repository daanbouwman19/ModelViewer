FROM ghcr.io/electron/devcontainer:latest

USER root
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get install -y libsqlite3-dev \
    && apt-get clean -y && rm -rf /var/lib/apt/lists/*
RUN sed -i '/cd \/workspaces\/gclient\/src\/electron/d' /home/builduser/.bashrc
USER builduser
ENV ELECTRON_DISABLE_SANDBOX=1 \
    ELECTRON_DISABLE_GPU=1