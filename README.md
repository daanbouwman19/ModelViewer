# My Album Slideshow Viewer

A desktop application built with Electron and Vue 3 for browsing and viewing local media files, with a focus on creating dynamic, weighted slideshows.

## Features

- **Album-Based Organization**: Automatically groups media files based on their parent directory, referring to each as an "album".
- **Media Viewer**: Supports a wide range of image and video formats. For performance, large videos are streamed via a local server.
- **Weighted Random Slideshows**: Start a slideshow for a single album or a global slideshow from multiple selected albums. The selection algorithm prioritizes less-viewed items, ensuring you see fresh content more often.
- **View Count Tracking**: Keeps track of how many times each media file has been viewed, which feeds into the slideshow weighting system.
- **Persistent Cache**: Your media library index is cached in a local SQLite database for fast startups.
- **Configurable Media Sources**: Easily add and manage multiple root directories for your media library.

## How it Works

The application uses a standard Electron architecture:

- **Main Process**: Handles all backend logic, including file system scanning, database operations (via a worker thread to keep the UI responsive), and running a local server for streaming large media files.
- **Renderer Process**: A Vue 3 single-page application that provides the user interface.
- **Preload Script**: Securely exposes a controlled API from the main process to the renderer process via `contextBridge`.

## Tech Stack

- **Framework**: [Electron](https://www.electronjs.org/)
- **UI Framework**: [Vue 3](https://vuejs.org/)
- **Build Tool**: [electron-vite](https://electron-vite.org/)
- **Packaging**: [electron-builder](https://www.electron.build/)
- **Database**: [sqlite3](https://github.com/TryGhost/node-sqlite3)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Testing**: [Vitest](https://vitest.dev/)
- **Formatting**: [Prettier](https://prettier.io/)

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS version recommended)
- A C++ compiler and Python for rebuilding native modules. This is required for `sqlite3`. See the [node-gyp installation guide](https://github.com/nodejs/node-gyp#installation) for platform-specific instructions.

### Setup

1.  **Clone the repository:**

    ```bash
    git clone <repository-url>
    cd <repository-directory>
    ```

2.  **Install dependencies:**
    This command will install all necessary dependencies and automatically rebuild native modules like `sqlite3` for the Electron environment.

    ```bash
    npm install
    ```

3.  **Configure Media Directory:**
    After launching the application for the first time, the library will be empty. Click "Manage Sources" to add one or more directories that contain your media files. The application will then scan them and build the library.

### Running the Application

To start the application in development mode with hot-reloading:

```bash
npm run dev
```

### Running Tests

To run the full test suite once:

```bash
npm test
```

To run tests in watch mode for interactive development:

```bash
npm run test:watch
```

To view the test UI:

```bash
npm run test:ui
```

### Formatting

To automatically format all source code files according to the project's Prettier configuration:

```bash
npm run format
```

## Building for Production

To create distributable packages for your current operating system:

```bash
npm run package
```

The packaged application will be located in the `out/` directory.

## Project Structure

- `src/main/`: Source code for the Electron **main process**.
- `src/preload/`: The Electron **preload script**.
- `src/renderer/`: Source code for the **renderer process** (the Vue 3 application).
- `tests/`: Vitest test files, mirroring the `src` directory structure.
- `electron.vite.config.mjs`: Configuration for the electron-vite build process.
- `vitest.config.js`: Configuration for the Vitest testing framework.
- `package.json`: Project metadata, dependencies, and scripts.
