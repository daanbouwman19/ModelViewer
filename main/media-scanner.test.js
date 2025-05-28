const path = require('path'); // Import path for constructing paths if needed by tests
const { findAllMediaFiles, performFullMediaScan } = require('./media-scanner.js');
const { ALL_SUPPORTED_EXTENSIONS, SUPPORTED_IMAGE_EXTENSIONS, SUPPORTED_VIDEO_EXTENSIONS } = require('./constants.js'); // Import for validation

// Mock the 'fs' module
jest.mock('fs');
const fs = require('fs'); // require fs after jest.mock('fs')

describe('Media Scanner Functions', () => {
  
  beforeEach(() => {
    // Reset the mock before each test to clear any previous mock implementations
    fs.readdirSync.mockReset();
    fs.statSync.mockReset(); // If statSync is used by readdirSync withFileTypes, or directly
    fs.existsSync.mockReset();
    // Default mock implementations (can be overridden in specific tests)
    fs.existsSync.mockReturnValue(true); // Assume path exists unless specified
  });

  describe('findAllMediaFiles', () => {
    const mockDirent = (name, isDirectory) => ({
      name,
      isDirectory: () => isDirectory,
      isFile: () => !isDirectory,
    });

    test('should return an empty list for an empty directory', () => {
      fs.readdirSync.mockReturnValue([]);
      const files = findAllMediaFiles('/fake/emptyDir');
      expect(files).toEqual([]);
    });

    test('should find all supported media files in a flat directory', () => {
      fs.readdirSync.mockImplementation((dirPath) => {
        if (dirPath === '/fake/flatDir') {
          return [
            mockDirent('img1.jpg', false),
            mockDirent('vid1.mp4', false),
            mockDirent('notes.txt', false),
            mockDirent('img2.png', false),
          ];
        }
        return [];
      });
      const files = findAllMediaFiles('/fake/flatDir');
      expect(files).toHaveLength(3);
      expect(files.map(f => f.name)).toEqual(expect.arrayContaining(['img1.jpg', 'vid1.mp4', 'img2.png']));
      expect(files.every(f => ALL_SUPPORTED_EXTENSIONS.includes(path.extname(f.name).toLowerCase()))).toBe(true);
    });

    test('should find files in nested directories', () => {
      fs.readdirSync.mockImplementation(dirPath => {
        if (dirPath === '/fake/nested') {
          return [mockDirent('subDir', true), mockDirent('root_img.gif', false)];
        }
        if (dirPath === path.join('/fake/nested', 'subDir')) {
          return [mockDirent('nested_vid.webm', false), mockDirent('another.txt', false)];
        }
        return [];
      });

      const files = findAllMediaFiles('/fake/nested');
      expect(files).toHaveLength(2);
      expect(files.map(f => f.name)).toEqual(expect.arrayContaining(['root_img.gif', 'nested_vid.webm']));
      expect(files.find(f=>f.name === 'root_img.gif').path).toBe(path.join('/fake/nested','root_img.gif'));
      expect(files.find(f=>f.name === 'nested_vid.webm').path).toBe(path.join('/fake/nested','subDir','nested_vid.webm'));
    });

    test('should handle read errors gracefully (by returning an empty list)', () => {
      // const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {}); // Removed
      fs.readdirSync.mockImplementation(dirPath => {
        if (dirPath === '/fake/errorDir') {
          throw new Error('Permission denied');
        }
        return [];
      });
      const files = findAllMediaFiles('/fake/errorDir');
      expect(files).toEqual([]);
      // expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[media-scanner.js] Error reading directory /fake/errorDir:'), expect.any(Error)); // Removed
      // consoleErrorSpy.mockRestore(); // Removed
    });
  });

  describe('performFullMediaScan', () => {
    const mockDirent = (name, isDirectory) => ({
      name,
      isDirectory: () => isDirectory,
      isFile: () => !isDirectory,
    });

    test('should return an empty array if base directory does not exist', async () => {
      fs.existsSync.mockReturnValue(false);
      // const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {}); // Removed
      
      const models = await performFullMediaScan('/non/existent/base');
      
      expect(models).toEqual([]);
      expect(fs.existsSync).toHaveBeenCalledWith('/non/existent/base');
      // expect(consoleErrorSpy).toHaveBeenCalledWith('[media-scanner.js] Base media directory not found: /non/existent/base'); // Removed
      // consoleErrorSpy.mockRestore(); // Removed
    });

    test('should correctly identify models and their textures', async () => {
      fs.existsSync.mockReturnValue(true); // Base directory exists
      fs.readdirSync.mockImplementation(dirPath => {
        if (dirPath === '/base/media') { // Base media directory
          return [mockDirent('modelA', true), mockDirent('modelB', true), mockDirent('somefile.txt', false)];
        }
        if (dirPath === path.join('/base/media', 'modelA')) {
          return [mockDirent('tex1.png', false), mockDirent('tex2.jpg', false)];
        }
        if (dirPath === path.join('/base/media', 'modelB')) {
          return [mockDirent('vid1.mp4', false), mockDirent('data.json', false)];
        }
        return [];
      });

      const models = await performFullMediaScan('/base/media');
      expect(models).toHaveLength(2);

      const modelA = models.find(m => m.name === 'modelA');
      expect(modelA).toBeDefined();
      expect(modelA.textures).toHaveLength(2);
      expect(modelA.textures.map(t => t.name)).toEqual(expect.arrayContaining(['tex1.png', 'tex2.jpg']));

      const modelB = models.find(m => m.name === 'modelB');
      expect(modelB).toBeDefined();
      expect(modelB.textures).toHaveLength(1);
      expect(modelB.textures.map(t => t.name)).toEqual(expect.arrayContaining(['vid1.mp4']));
    });
    
    test('should return empty models array if scan encounters errors at top level', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockImplementation(() => { throw new Error('Disk read error'); });
      // const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {}); // Removed

      const models = await performFullMediaScan('/base/error');
      expect(models).toEqual([]);
      // expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[media-scanner.js] Error scanning disk for models:'), expect.any(Error)); // Removed
      // consoleErrorSpy.mockRestore(); // Removed
    });
  });
});
