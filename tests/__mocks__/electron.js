// tests/__mocks__/electron.js

const path = require('path');
const fs = require('fs');

// This path needs to lead to where test_user_data will be created, relative to the project root
// Since __mocks__ is under tests/, __dirname is /app/tests/__mocks__
// We want test_user_data to be /app/tests/test_user_data
const mockAppUserDataPath = path.join(__dirname, '..', 'test_user_data');

if (!fs.existsSync(mockAppUserDataPath)) {
    fs.mkdirSync(mockAppUserDataPath, { recursive: true });
}

module.exports = {
    app: {
        getPath: jest.fn((name) => {
            if (name === 'userData') {
                return mockAppUserDataPath;
            }
            // For other paths, you might want to return a generic mock path or throw an error
            // depending on what your application expects.
            return path.join(mockAppUserDataPath, name);
        }),
        isPackaged: false, // Or whatever default you need
    },
    ipcRenderer: {
        on: jest.fn(),
        send: jest.fn(),
        removeListener: jest.fn(),
        removeAllListeners: jest.fn(),
    },
    ipcMain: {
        on: jest.fn(),
        handle: jest.fn(),
        removeListener: jest.fn(),
        removeAllListeners: jest.fn(),
    },
    // Add other Electron modules and functions as needed by your tests
};
