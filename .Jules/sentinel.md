## 2024-05-23 - IPC Handler Authorization Gap

**Vulnerability:** The `open-in-vlc` IPC handler accepted any file path from the renderer and executed it using `child_process.spawn`. This allowed a compromised renderer (or malicious user) to open any file on the system, leading to unauthorized access and potential execution of arbitrary arguments if filenames were crafted maliciously.
**Learning:** IPC handlers that perform sensitive operations (like file access or command execution) must explicitly validate the input against a whitelist or authorized scope (e.g., `mediaDirectories`). Relying on the renderer to only send "safe" paths is insufficient.
**Prevention:** Always treat IPC arguments as untrusted user input. Implement a centralized authorization check (e.g., `isPathAllowed`) and apply it to ALL file-system related IPC handlers.
