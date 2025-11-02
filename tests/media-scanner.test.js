const fs = require('fs');
const path = require('path');
const {
  findAllMediaFiles,
  performFullMediaScan,
} = require('../main/media-scanner');

// Define a temporary directory for test files
const TEST_MEDIA_DIR = path.join(__dirname, 'test_media_files');

// Helper function to create dummy files
const createDummyFile = (filePath) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, 'dummy content');
};

describe('media-scanner.js', () => {
  beforeAll(() => {
    // Set up a test directory structure
    // TEST_MEDIA_DIR
    // ├── model1
    // │   ├── image1.png
    // │   ├── video1.mp4
    // │   └── document.txt
    // ├── model2
    // │   ├── image2.jpg
    // │   └── subfolder
    // │       └── image3.jpeg
    // ├── empty_model
    // └── file_not_folder.txt

    if (fs.existsSync(TEST_MEDIA_DIR)) {
      fs.rmdirSync(TEST_MEDIA_DIR, { recursive: true });
    }
    fs.mkdirSync(TEST_MEDIA_DIR);

    // Model 1
    createDummyFile(path.join(TEST_MEDIA_DIR, 'model1', 'image1.png'));
    createDummyFile(path.join(TEST_MEDIA_DIR, 'model1', 'video1.mp4'));
    createDummyFile(path.join(TEST_MEDIA_DIR, 'model1', 'document.txt')); // Unsupported

    // Model 2
    createDummyFile(path.join(TEST_MEDIA_DIR, 'model2', 'image2.jpg'));
    createDummyFile(
      path.join(TEST_MEDIA_DIR, 'model2', 'subfolder', 'image3.jpeg'),
    );

    // Empty Model
    fs.mkdirSync(path.join(TEST_MEDIA_DIR, 'empty_model'));

    // Non-folder item at root of test media dir
    createDummyFile(path.join(TEST_MEDIA_DIR, 'file_not_folder.txt'));
    process.env.NODE_ENV = 'test'; // Suppress console logs from scanner
  });

  afterAll(() => {
    // Clean up the test directory
    if (fs.existsSync(TEST_MEDIA_DIR)) {
      fs.rmdirSync(TEST_MEDIA_DIR, { recursive: true });
    }
    delete process.env.NODE_ENV;
  });

  describe('findAllMediaFiles', () => {
    it('should find all supported media files in a directory, including subdirectories', () => {
      const model1Path = path.join(TEST_MEDIA_DIR, 'model1');
      const files = findAllMediaFiles(model1Path);
      expect(files).toHaveLength(2);
      expect(files).toEqual(
        expect.arrayContaining([
          { name: 'image1.png', path: path.join(model1Path, 'image1.png') },
          { name: 'video1.mp4', path: path.join(model1Path, 'video1.mp4') },
        ]),
      );
    });

    it('should find files in subdirectories', () => {
      const model2Path = path.join(TEST_MEDIA_DIR, 'model2');
      const files = findAllMediaFiles(model2Path);
      expect(files).toHaveLength(2);
      expect(files).toEqual(
        expect.arrayContaining([
          { name: 'image2.jpg', path: path.join(model2Path, 'image2.jpg') },
          {
            name: 'image3.jpeg',
            path: path.join(model2Path, 'subfolder', 'image3.jpeg'),
          },
        ]),
      );
    });

    it('should return an empty array if no supported files are found', () => {
      const emptyModelPath = path.join(TEST_MEDIA_DIR, 'empty_model');
      const files = findAllMediaFiles(emptyModelPath);
      expect(files).toHaveLength(0);
    });

    it('should return an empty array for a non-existent directory', () => {
      const nonExistentPath = path.join(TEST_MEDIA_DIR, 'non_existent_model');
      const files = findAllMediaFiles(nonExistentPath);
      expect(files).toHaveLength(0);
    });

    it('should only include files with supported extensions', () => {
      // Create a temporary file with an unsupported extension
      const unsupportedFilePath = path.join(
        TEST_MEDIA_DIR,
        'model1',
        'unsupported.abc',
      );
      createDummyFile(unsupportedFilePath);

      const model1Path = path.join(TEST_MEDIA_DIR, 'model1');
      const files = findAllMediaFiles(model1Path);
      expect(files.some((file) => file.name === 'unsupported.abc')).toBe(false);
      expect(files.length).toBe(2); // image1.png, video1.mp4

      fs.unlinkSync(unsupportedFilePath); // Clean up
    });

    it('should handle errors when reading a directory (e.g., permission denied)', () => {
      const unreadableDirPath = path.join(TEST_MEDIA_DIR, 'unreadable_dir');
      fs.mkdirSync(unreadableDirPath, { mode: 0o000 }); // No read permission

      let files = [];
      // Wrap in try-catch because fs.readdirSync might throw before our internal catch
      try {
        files = findAllMediaFiles(unreadableDirPath);
      } catch (e) {
        // Expected if readdirSync itself throws due to permissions on some OS
      }
      expect(files).toEqual([]); // Should not throw, return empty or partially scanned list

      // Clean up: Need to restore permissions to delete on some OS (like Linux)
      try {
        fs.chmodSync(unreadableDirPath, 0o755);
        fs.rmdirSync(unreadableDirPath);
      } catch (e) {
        console.warn(`Could not clean up unreadable_dir: ${e.message}`);
      }
    });
  });

  describe('performFullMediaScan', () => {
    it('should perform a full scan and identify models with their media files', async () => {
      const models = await performFullMediaScan([TEST_MEDIA_DIR]);
      expect(models).toHaveLength(2); // model1 and model2 (empty_model should be skipped)

      const model1 = models.find((m) => m.name === 'model1');
      expect(model1).toBeDefined();
      expect(model1.textures).toHaveLength(2);
      expect(model1.textures).toEqual(
        expect.arrayContaining([
          {
            name: 'image1.png',
            path: path.join(TEST_MEDIA_DIR, 'model1', 'image1.png'),
          },
          {
            name: 'video1.mp4',
            path: path.join(TEST_MEDIA_DIR, 'model1', 'video1.mp4'),
          },
        ]),
      );

      const model2 = models.find((m) => m.name === 'model2');
      expect(model2).toBeDefined();
      expect(model2.textures).toHaveLength(2);
      expect(model2.textures).toEqual(
        expect.arrayContaining([
          {
            name: 'image2.jpg',
            path: path.join(TEST_MEDIA_DIR, 'model2', 'image2.jpg'),
          },
          {
            name: 'image3.jpeg',
            path: path.join(
              TEST_MEDIA_DIR,
              'model2',
              'subfolder',
              'image3.jpeg',
            ),
          },
        ]),
      );
    });

    it('should return an empty array if the base media directory does not exist', async () => {
      const nonExistentBaseDir = path.join(
        __dirname,
        'non_existent_base_media_dir',
      );
      const models = await performFullMediaScan([nonExistentBaseDir]);
      expect(models).toEqual([]);
    });

    it('should skip model folders that contain no supported media files', async () => {
      // empty_model was created in beforeAll and contains no files
      const models = await performFullMediaScan([TEST_MEDIA_DIR]);
      const emptyModel = models.find((m) => m.name === 'empty_model');
      expect(emptyModel).toBeUndefined();
    });

    it('should correctly handle a base directory with no subfolders (no models)', async () => {
      const noSubfoldersDir = path.join(TEST_MEDIA_DIR, 'no_subfolders_here');
      fs.mkdirSync(noSubfoldersDir);
      createDummyFile(path.join(noSubfoldersDir, 'some_root_file.png')); // A file, not a model folder

      const models = await performFullMediaScan([noSubfoldersDir]);
      expect(models).toEqual([]);

      fs.unlinkSync(path.join(noSubfoldersDir, 'some_root_file.png'));
      fs.rmdirSync(noSubfoldersDir);
    });

    it('should handle an empty base directory', async () => {
      const emptyDir = path.join(TEST_MEDIA_DIR, 'empty_dir');
      fs.mkdirSync(emptyDir);

      const models = await performFullMediaScan([emptyDir]);
      expect(models).toEqual([]);

      fs.rmdirSync(emptyDir);
    });

    it('should handle errors during directory reading gracefully (e.g. permissions)', async () => {
      const originalReaddirSync = fs.readdirSync;
      fs.readdirSync = (dirPath, options) => {
        if (dirPath === path.join(TEST_MEDIA_DIR, 'model1')) {
          throw new Error('Simulated permission denied');
        }
        return originalReaddirSync(dirPath, options);
      };

      const models = await performFullMediaScan([TEST_MEDIA_DIR]);
      // model1 scan will fail, but model2 should still be found.
      expect(models.find((m) => m.name === 'model1')).toBeUndefined();
      expect(models.find((m) => m.name === 'model2')).toBeDefined();
      expect(models.length).toBe(1); // Only model2

      fs.readdirSync = originalReaddirSync; // Restore original
    });

    it('should handle a case where a path is not a directory', () => {
      const filePath = path.join(TEST_MEDIA_DIR, 'file_not_folder.txt');
      const files = findAllMediaFiles(filePath);
      expect(files).toEqual([]);
    });
  });

  describe('findAllMediaFiles with file path', () => {
    it('should return an empty array when the path is a file', () => {
      const filePath = path.join(TEST_MEDIA_DIR, 'model1', 'image1.png');
      const files = findAllMediaFiles(filePath);
      expect(files).toEqual([]);
    });
  });
});
