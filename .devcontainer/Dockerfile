FROM ghcr.io/electron/devcontainer:latest

USER root
RUN sed -i '/cd \/workspaces\/gclient\/src\/electron/d' /home/builduser/.bashrc

USER builduser

WORKDIR /home/builduser/app 

COPY --chown=builduser:builduser package*.json ./

RUN --mount=type=cache,target=/home/builduser/.npm \
    sh -c "sudo chown -R builduser:builduser /home/builduser/.npm && npm ci"
    
COPY --chown=builduser:builduser . .

# Set Electron environment variables to disable sandbox/GPU in container
ENV ELECTRON_DISABLE_SANDBOX=1 \
    ELECTRON_DISABLE_GPU=1

ENTRYPOINT []
CMD ["sleep", "infinity"]
