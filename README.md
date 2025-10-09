# My Model Slideshow Viewer

## 1. Introduction

This application is a desktop tool built with Electron for browsing and viewing local media files, specifically organized into "models". It's designed to help users manage and view collections of images and videos stored in a structured folder hierarchy.

The application scans a designated root directory, treating each sub-directory as a "model". It then allows you to view the media within each model, either individually or as part of a global, weighted-random slideshow.

## 2. Features

- **Model-Based Organization**: Automatically detects sub-directories as distinct "models".
- **Media Viewer**: Supports a wide range of image and video formats (`.png`, `.jpg`, `.mp4`, `.mkv`, etc.).
- **Individual Slideshows**: View all media within a single model, with options for sequential or random playback.
- **Global Slideshow**: A continuous, weighted-random slideshow that pulls media from all models you've selected to include. The weighting algorithm prioritizes media you haven't seen as often.
- **View Count Tracking**: The application keeps track of how many times you've viewed each media file.
- **Slideshow Timer**: An adjustable timer to automatically advance to the next media item.
- **Efficient Video Handling**: Large video files are streamed via a local HTTP server to minimize memory usage, while smaller files are loaded directly.
- **Persistent Cache**: Your media library index is cached in a local SQLite database for fast startups.
- **On-Demand Re-indexing**: Manually trigger a re-scan of your library if you've added, moved, or deleted files.

## 3. Tech Stack

- **Framework**: [Electron](https://www.electronjs.org/)
- **Database**: [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) for local data persistence.
- **Frontend**: Vanilla HTML, CSS, and JavaScript (ES Modules).
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) for UI components.
- **Testing**: [Jest](https://jestjs.io/) for unit and integration tests.
- **Formatting**: [Prettier](https://prettier.io/) for consistent code style.
- **Building/Packaging**: [electron-builder](https://www.electron.build/) for creating distributable installers.

## 4. Setup and Installation

To get the application running on your local machine for development, follow these steps.

### Prerequisites

- [Node.js](https://nodejs.org/) (includes npm)
- A C++ compiler and Python for rebuilding native modules (see [node-gyp installation guide](https://github.com/nodejs/node-gyp#on-windows)). This is required for `better-sqlite3`.

### Installation Steps

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd <repository-directory>
    ```

2.  **Install dependencies:**
    This command installs all necessary packages defined in `package.json`.
    ```bash
    npm install
    ```

3.  **Configure Media Directory:**
    The application needs to know where your media library is located. Open the `main/main.js` file and find the following line:
    ```javascript
    const baseMediaDirectory = 'D:\\test'; // Make sure this path is accessible or change it
    ```
    **Change `'D:\\test'`** to the absolute path of the directory containing your model folders.

    For example, if your media is organized like this:
    ```
    C:/Users/YourUser/Pictures/MyLibrary/
    ├── ModelA/
    │   ├── image01.jpg
    │   └── video01.mp4
    └── ModelB/
        ├── image02.png
        └── image03.webp
    ```
    You would set `baseMediaDirectory` to `'C:/Users/YourUser/Pictures/MyLibrary'`.

## 5. Usage

### Running the Application in Development Mode

To start the application with live reloading and access to developer tools:
```bash
npm start
```

### Running Tests

To execute the automated test suite:
```bash
npm test
```

### Linting and Formatting

To automatically format all source code files according to the project's Prettier configuration:
```bash
npm run format
```

### Building for Production

To package the application into a distributable installer for your current operating system (e.g., an `.exe` on Windows or a `.dmg` on macOS):
```bash
npm run dist
```
The packaged application will be located in the `dist/` directory.

## 6. Project Structure

The repository is organized into the following key directories and files:

-   `main/`: Contains all source code for the Electron **main process**.
    -   `main.js`: The main entry point of the application. Manages the app lifecycle, windows, and IPC.
    -   `database.js`: Handles all interactions with the SQLite database.
    -   `media-scanner.js`: Logic for scanning the file system to find models and media.
    -   `local-server.js`: A lightweight HTTP server for streaming large video files.
    -   `constants.js`: Shared constants for the main process.
-   `renderer/`: Contains all source code for the Electron **renderer process** (the UI).
    -   `renderer.js`: The entry point for the UI. Initializes the app and sets up event listeners.
    -   `event-handlers.js`: Contains the core logic for handling user interactions.
    -   `slideshow.js`: Manages slideshow functionality, timers, and playlist logic.
    -   `ui-updates.js`: Functions that directly manipulate the DOM to reflect state changes.
    -   `state.js`: A single object that holds the entire application state for the UI.
    -   `ui-elements.js`: Centralized references to all important DOM elements.
-   `tests/`: Contains all Jest test files.
-   `index.html`: The main HTML file for the user interface.
-   `preload.js`: The Electron preload script, which securely bridges the main and renderer processes.
-   `package.json`: Defines project metadata, dependencies, and scripts.
-   `jest.config.js`: Configuration for the Jest testing framework.
-   `.prettierrc.json`: Configuration for the Prettier code formatter.