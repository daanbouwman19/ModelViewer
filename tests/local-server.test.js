import { describe, it, expect, afterEach } from 'vitest';
import http from 'http';
import fs from 'fs';
import path from 'path';
import {
  startLocalServer,
  stopLocalServer,
  getServerPort,
  getMimeType,
} from '../src/main/local-server.js';

// Helper to promisify callback-based functions
const startServer = () =>
  new Promise((resolve) => {
    startLocalServer(() => resolve());
  });

const stopServer = () =>
  new Promise((resolve) => {
    stopLocalServer(() => resolve());
  });

describe('Local Server', () => {
  afterEach(async () => {
    // Clean up server after each test
    if (getServerPort() > 0) {
      await stopServer();
    }
  });

  describe('getMimeType', () => {
    it('should return correct MIME type for images', () => {
      expect(getMimeType('test.png')).toBe('image/png');
      expect(getMimeType('test.jpg')).toBe('image/jpeg');
      expect(getMimeType('test.jpeg')).toBe('image/jpeg');
    });

    it('should return correct MIME type for videos', () => {
      expect(getMimeType('test.mp4')).toBe('video/mp4');
      expect(getMimeType('test.webm')).toBe('video/webm');
      expect(getMimeType('test.mov')).toBe('video/quicktime');
    });

    it('should return default MIME type for unknown extensions', () => {
      expect(getMimeType('test.txt')).toBe('application/octet-stream');
    });
  });

  describe('startLocalServer', () => {
    it('should start server and set port', async () => {
      await startServer();
      expect(getServerPort()).toBeGreaterThan(0);
    });

    it('should handle starting when server already running', async () => {
      await startServer();
      const port1 = getServerPort();
      await startServer();
      const port2 = getServerPort();
      expect(port1).toBe(port2);
    });
  });

  describe('stopLocalServer', () => {
    it('should stop the server', async () => {
      await startServer();
      expect(getServerPort()).toBeGreaterThan(0);

      await stopServer();
      expect(getServerPort()).toBe(0);
    });

    it('should handle stopping when server not running', async () => {
      await stopServer();
      expect(getServerPort()).toBe(0);
    });
  });

  describe('getServerPort', () => {
    it('should return 0 when server not started', () => {
      expect(getServerPort()).toBe(0);
    });

    it('should return port when server is running', async () => {
      await startServer();
      const port = getServerPort();
      expect(port).toBeGreaterThan(0);
    });
  });

  describe('HTTP Request Handling', () => {
    let testFilePath;

    afterEach(() => {
      // Clean up test file
      if (testFilePath && fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
    });

    it('should serve a file successfully', async () => {
      // Create a test file
      const testDir = path.join(process.cwd(), 'tests', 'temp');
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      testFilePath = path.join(testDir, 'test-file.txt');
      const testContent = 'Hello, World!';
      fs.writeFileSync(testFilePath, testContent);

      await startServer();
      const port = getServerPort();

      // Make HTTP request
      const response = await new Promise((resolve, reject) => {
        const req = http.get(
          `http://127.0.0.1:${port}/${encodeURIComponent(testFilePath)}`,
          (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () =>
              resolve({
                statusCode: res.statusCode,
                data,
                headers: res.headers,
              }),
            );
          },
        );
        req.on('error', reject);
      });

      expect(response.statusCode).toBe(200);
      expect(response.data).toBe(testContent);
      expect(response.headers['content-type']).toBe('application/octet-stream');
    });

    it('should return 404 for non-existent file', async () => {
      await startServer();
      const port = getServerPort();

      const response = await new Promise((resolve, reject) => {
        const req = http.get(
          `http://127.0.0.1:${port}/nonexistent-file.txt`,
          (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => resolve({ statusCode: res.statusCode, data }));
          },
        );
        req.on('error', reject);
      });

      expect(response.statusCode).toBe(404);
      expect(response.data).toBe('File not found.');
    });

    it('should handle range requests', async () => {
      // Create a test file
      const testDir = path.join(process.cwd(), 'tests', 'temp');
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      testFilePath = path.join(testDir, 'test-range.txt');
      const testContent = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      fs.writeFileSync(testFilePath, testContent);

      await startServer();
      const port = getServerPort();

      // Make range request
      const response = await new Promise((resolve, reject) => {
        const options = {
          hostname: '127.0.0.1',
          port,
          path: `/${encodeURIComponent(testFilePath)}`,
          headers: { Range: 'bytes=0-9' },
        };

        const req = http.get(options, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () =>
            resolve({ statusCode: res.statusCode, data, headers: res.headers }),
          );
        });
        req.on('error', reject);
      });

      expect(response.statusCode).toBe(206);
      expect(response.data).toBe('ABCDEFGHIJ');
      expect(response.headers['content-range']).toContain('bytes 0-9/26');
    });

    it('should return 416 for invalid range', async () => {
      // Create a test file
      const testDir = path.join(process.cwd(), 'tests', 'temp');
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      testFilePath = path.join(testDir, 'test-invalid-range.txt');
      fs.writeFileSync(testFilePath, 'Content');

      await startServer();
      const port = getServerPort();

      // Make invalid range request
      const response = await new Promise((resolve, reject) => {
        const options = {
          hostname: '127.0.0.1',
          port,
          path: `/${encodeURIComponent(testFilePath)}`,
          headers: { Range: 'bytes=1000-2000' },
        };

        const req = http.get(options, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve({ statusCode: res.statusCode, data }));
        });
        req.on('error', reject);
      });

      expect(response.statusCode).toBe(416);
      expect(response.data).toBe('Requested range not satisfiable.');
    });

    it('should serve video files with correct MIME type', async () => {
      // Create a test video file
      const testDir = path.join(process.cwd(), 'tests', 'temp');
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      testFilePath = path.join(testDir, 'test-video.mp4');
      fs.writeFileSync(testFilePath, 'fake video content');

      await startServer();
      const port = getServerPort();

      const response = await new Promise((resolve, reject) => {
        const req = http.get(
          `http://127.0.0.1:${port}/${encodeURIComponent(testFilePath)}`,
          (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () =>
              resolve({ statusCode: res.statusCode, headers: res.headers }),
            );
          },
        );
        req.on('error', reject);
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('video/mp4');
      expect(response.headers['accept-ranges']).toBe('bytes');
    });
  });
});
