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
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Packaging**: [Electron Forge](https://www.electronforge.io/)
- **Database**: [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Testing**: [Jest](https://jestjs.io/)
- **Formatting**: [Prettier](https://prettier.io/)

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (includes npm)
- A C++ compiler and Python for rebuilding native modules (see [node-gyp installation guide](https://github.com/nodejs/node-gyp#installation)). This is required for `better-sqlite3`.

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
npm start
```

### Running Tests

To run the test suite:

```bash
npm test
```

### Formatting

To automatically format all source code files:

```bash
npm run format
```

## Building for Production

To create distributable packages:

```bash
npm run make
```

## Project Structure

- `src/main/`: Source code for the Electron **main process**.
- `src/preload/`: The Electron **preload script**.
- `src/renderer/`: Source code for the **renderer process** (Vue 3 application).
- `tests/`: Jest test files.
- `forge.config.js`: Configuration for Electron Forge.
- `vite.renderer.config.mjs`: Vite configuration for the renderer process.
- `package.json`: Project metadata, dependencies, and scripts.
