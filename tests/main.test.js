const { ipcMain } = require('electron');
const fs = 'fs';
const path = 'path';

// Mock dependencies
jest.mock('electron', () => ({
  app: { on: jest.fn(), whenReady: jest.fn(() => Promise.resolve()) },
  BrowserWindow: jest.fn(() => ({
    loadFile: jest.fn(() => Promise.resolve()),
    on: jest.fn(),
  })),
  ipcMain: { handle: jest.fn() },
}));
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  statSync: jest.fn(),
  readFileSync: jest.fn(),
}));

jest.mock('path', () => ({
  ...jest.requireActual('path'),
  join: jest.fn((...args) => args.join('/')),
  extname: jest.fn().mockReturnValue(''),
}));

jest.mock('../main/database.js', () => ({
  initDatabase: jest.fn(),
  recordMediaView: jest.fn(),
  getMediaViewCounts: jest.fn(),
  cacheModels: jest.fn(),
  getCachedModels: jest.fn(),
  closeDatabase: jest.fn(),
}));
jest.mock('../main/media-scanner.js', () => ({
  performFullMediaScan: jest.fn(),
}));
jest.mock('../main/local-server.js', () => ({
  startLocalServer: jest.fn(),
  stopLocalServer: jest.fn(),
  getServerPort: jest.fn(),
  getMimeType: jest.fn(),
}));

describe('Main Process', () => {
  let ipcMain;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.resetModules();
    jest.clearAllMocks();

    // Import the mock ipcMain
    ipcMain = require('electron').ipcMain;

    require('../main/main.js');
  });

  describe('IPC Handlers', () => {
    const getIpcHandler = (channel) => {
      const call = ipcMain.handle.mock.calls.find((c) => c[0] === channel);
      if (!call) {
        throw new Error(`IPC handler for channel "${channel}" not found`);
      }
      return call[1];
    };

    it('should register all IPC handlers', () => {
      const registeredHandlers = ipcMain.handle.mock.calls.map(
        (call) => call[0],
      );
      expect(registeredHandlers).toContain('load-file-as-data-url');
      expect(registeredHandlers).toContain('record-media-view');
      expect(registeredHandlers).toContain('get-media-view-counts');
      expect(registeredHandlers).toContain('get-models-with-view-counts');
      expect(registeredHandlers).toContain('reindex-media-library');
    });

    describe('load-file-as-data-url', () => {
      it('should return an error if the file does not exist', async () => {
        const fs = require('fs');
        fs.existsSync.mockReturnValue(false);
        const handler = getIpcHandler('load-file-as-data-url');
        const result = await handler(null, 'non-existent-file.txt');
        expect(result).toEqual({
          type: 'error',
          message: 'File does not exist.',
        });
      });

      it('should return an http-url for a large video file when the server is running', async () => {
        const fs = require('fs');
        const path = require('path');
        const { getServerPort } = require('../main/local-server.js');
        const { MAX_DATA_URL_SIZE_MB } = require('../main/constants.js');

        fs.existsSync.mockReturnValue(true);
        fs.statSync.mockReturnValue({
          size: (MAX_DATA_URL_SIZE_MB + 1) * 1024 * 1024,
        });
        path.extname.mockReturnValue('.mp4');
        getServerPort.mockReturnValue(8080);

        const handler = getIpcHandler('load-file-as-data-url');
        const result = await handler(null, 'large-video.mp4');

        expect(result).toEqual({
          type: 'http-url',
          url: 'http://localhost:8080/large-video.mp4',
        });
      });

      it('should return an error for a large video file when the server is not ready', async () => {
        const fs = require('fs');
        const path = require('path');
        const { getServerPort } = require('../main/local-server.js');
        const { MAX_DATA_URL_SIZE_MB } = require('../main/constants.js');

        fs.existsSync.mockReturnValue(true);
        fs.statSync.mockReturnValue({
          size: (MAX_DATA_URL_SIZE_MB + 1) * 1024 * 1024,
        });
        path.extname.mockReturnValue('.mp4');
        getServerPort.mockReturnValue(0);

        const handler = getIpcHandler('load-file-as-data-url');
        const result = await handler(null, 'large-video.mp4');
        expect(result).toEqual({
          type: 'error',
          message: 'Local server not ready to stream large video.',
        });
      });

      it('should return a data-url for a small file', async () => {
        const fs = require('fs');
        const { getMimeType } = require('../main/local-server.js');
        const { MAX_DATA_URL_SIZE_MB } = require('../main/constants.js');

        fs.existsSync.mockReturnValue(true);
        fs.statSync.mockReturnValue({
          size: (MAX_DATA_URL_SIZE_MB - 1) * 1024 * 1024,
        });
        fs.readFileSync.mockReturnValue(Buffer.from('test data'));
        getMimeType.mockReturnValue('image/png');

        const handler = getIpcHandler('load-file-as-data-url');
        const result = await handler(null, 'small-file.png');

        expect(result.type).toBe('data-url');
        expect(result.url).toBe('data:image/png;base64,dGVzdCBkYXRh');
      });

      it('should return an error if reading the file fails', async () => {
        const fs = require('fs');
        fs.existsSync.mockReturnValue(true);
        fs.statSync.mockReturnValue({ size: 1024 });
        fs.readFileSync.mockImplementation(() => {
          throw new Error('Read error');
        });

        const handler = getIpcHandler('load-file-as-data-url');
        const result = await handler(null, 'file.txt');
        expect(result).toEqual({ type: 'error', message: 'Read error' });
      });
    });

    describe('Other IPC Handlers', () => {
      it('should call recordMediaView', async () => {
        const { recordMediaView } = require('../main/database.js');
        const handler = getIpcHandler('record-media-view');
        await handler(null, 'file/path');
        expect(recordMediaView).toHaveBeenCalledWith('file/path');
      });

      it('should call getMediaViewCounts', async () => {
        const { getMediaViewCounts } = require('../main/database.js');
        const handler = getIpcHandler('get-media-view-counts');
        await handler(null, ['file/path']);
        expect(getMediaViewCounts).toHaveBeenCalledWith(['file/path']);
      });

      it('should get models from cache and return with view counts', async () => {
        const {
          getCachedModels,
          getMediaViewCounts,
        } = require('../main/database.js');
        const handler = getIpcHandler('get-models-with-view-counts');

        getCachedModels.mockResolvedValue([
          { name: 'model1', textures: [{ path: 'texture1.png' }] },
        ]);
        getMediaViewCounts.mockResolvedValue({ 'texture1.png': 5 });

        const result = await handler();

        expect(getCachedModels).toHaveBeenCalled();
        expect(getMediaViewCounts).toHaveBeenCalledWith(['texture1.png']);
        expect(result[0].textures[0].viewCount).toBe(5);
      });

      it('should re-index and return models with view counts', async () => {
        const { performFullMediaScan } = require('../main/media-scanner.js');
        const {
          cacheModels,
          getMediaViewCounts,
        } = require('../main/database.js');
        const handler = getIpcHandler('reindex-media-library');

        performFullMediaScan.mockResolvedValue([
          { name: 'model1', textures: [{ path: 'texture1.png' }] },
        ]);
        getMediaViewCounts.mockResolvedValue({ 'texture1.png': 1 });

        const result = await handler();

        expect(performFullMediaScan).toHaveBeenCalled();
        expect(cacheModels).toHaveBeenCalled();
        expect(getMediaViewCounts).toHaveBeenCalledWith(['texture1.png']);
        expect(result[0].textures[0].viewCount).toBe(1);
      });
    });
  });
});
