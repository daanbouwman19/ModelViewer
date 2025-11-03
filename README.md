# My Model Slideshow Viewer

A desktop application built with Electron and Vue 3 for browsing and viewing local media files.

## Features

- **Model-Based Organization**: Automatically detects sub-directories as distinct "models".
- **Media Viewer**: Supports a wide range of image and video formats.
- **Slideshows**: View all media within a single model or in a global, weighted-random slideshow.
- **View Count Tracking**: Keeps track of how many times each media file has been viewed.
- **Persistent Cache**: Your media library index is cached in a local SQLite database for fast startups.

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

- [Node.js](https://nodejs.org/) (includes npm)
- A C++ compiler and Python for rebuilding native modules (see [node-gyp installation guide](https://github.com/nodejs/node-gyp#installation)). This is required for `sqlite3`.

### Setup

1.  **Clone the repository:**

    ```bash
    git clone <repository-url>
    cd <repository-directory>
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    ```

3.  **Configure Media Directory:**
    After launching the application, you must add a media source directory via the UI to see your models.

### Running the Application

To start the application in development mode:

```bash
npm run dev
```

### Running Tests

To run the test suite:

```bash
npm test
```

To run tests in watch mode:

```bash
npm run test:watch
```

To run tests with UI:

```bash
npm run test:ui
```

### Formatting

To automatically format all source code files:

```bash
npm run format
```

## Building for Production

To create distributable packages:

```bash
npm run package
```

For platform-specific builds:

```bash
npm run package:linux   # Build for Linux (AppImage, deb)
npm run package:win     # Build for Windows
npm run package:mac     # Build for macOS
```

## Project Structure

- `src/main/`: Source code for the Electron **main process** (ES modules).
- `src/preload/`: The Electron **preload script**.
- `src/renderer/`: Source code for the **renderer process** (Vue 3 application).
- `tests/`: Vitest test files.
- `electron.vite.config.mjs`: Configuration for electron-vite build process.
- `vitest.config.mjs`: Configuration for Vitest testing framework.
- `package.json`: Project metadata, dependencies, and scripts.
