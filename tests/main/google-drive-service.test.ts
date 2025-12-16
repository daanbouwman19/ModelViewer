import { describe, it, expect, vi, beforeEach } from 'vitest';
import { google } from 'googleapis';

// We need to mock imports BEFORE importing the module under test
vi.mock('../../src/main/google-auth');
vi.mock('googleapis');

// Import the module under test dynamically to support resetting

const mockDrive = {
  files: {
    list: vi.fn(),
    get: vi.fn(),
  },
};

(google.drive as any).mockReturnValue(mockDrive);

describe('Google Drive Service', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('getDriveClient', () => {
    it('should initialize drive client if auth is valid', async () => {
      // Re-import to reset module state (driveClient = null)
      const driveService = await import('../../src/main/google-drive-service');
      const googleAuth = await import('../../src/main/google-auth');

      (googleAuth.getOAuth2Client as any).mockReturnValue({
        credentials: { refresh_token: 'valid' },
      });

      const client = await driveService.getDriveClient();
      expect(client).toBe(mockDrive);
      expect(google.drive).toHaveBeenCalled();
    });

    it('should try to load credentials if not authenticated', async () => {
      const driveService = await import('../../src/main/google-drive-service');
      const googleAuth = await import('../../src/main/google-auth');

      (googleAuth.getOAuth2Client as any).mockReturnValue({
        credentials: {}, // empty
      });
      (googleAuth.loadSavedCredentialsIfExist as any).mockResolvedValue(true);

      const client = await driveService.getDriveClient();
      expect(client).toBe(mockDrive);
      expect(googleAuth.loadSavedCredentialsIfExist).toHaveBeenCalled();
    });

    it('should throw if authentication fails', async () => {
      const driveService = await import('../../src/main/google-drive-service');
      const googleAuth = await import('../../src/main/google-auth');

      (googleAuth.getOAuth2Client as any).mockReturnValue({
        credentials: {},
      });
      (googleAuth.loadSavedCredentialsIfExist as any).mockResolvedValue(false);

      await expect(driveService.getDriveClient()).rejects.toThrow(
        'User not authenticated',
      );
    });
  });

  describe('listDriveFiles', () => {
    it('should return album structure recursively', async () => {
      const driveService = await import('../../src/main/google-drive-service');
      const googleAuth = await import('../../src/main/google-auth');

      (googleAuth.getOAuth2Client as any).mockReturnValue({
        credentials: { refresh_token: 'valid' },
      });

      const mockFilesRoot = [
        { id: 'f1', name: 'image.jpg', mimeType: 'image/jpeg' },
      ];
      const mockFoldersRoot = [
        {
          id: 'subfolder_id',
          name: 'SubFolder',
          mimeType: 'application/vnd.google-apps.folder',
        },
      ];

      const mockFilesSub = [
        { id: 'f2', name: 'subimage.jpg', mimeType: 'image/jpeg' },
      ];

      const listMock = mockDrive.files.list as any;
      listMock.mockReset();

      // 1. Root files
      listMock.mockResolvedValueOnce({ data: { files: mockFilesRoot } });
      // 2. Root folders
      listMock.mockResolvedValueOnce({ data: { files: mockFoldersRoot } });

      // 3. Subfolder files
      listMock.mockResolvedValueOnce({ data: { files: mockFilesSub } });
      // 4. Subfolder folders (empty)
      listMock.mockResolvedValueOnce({ data: { files: [] } });

      const result = await driveService.listDriveFiles('root');

      expect(result.textures).toHaveLength(1);
      expect(result.textures[0].path).toBe('gdrive://f1');

      expect(result.children).toHaveLength(1);
      expect(result.children[0].name).toBe('SubFolder');
      expect(result.children[0].textures).toHaveLength(1);
      expect(result.children[0].textures[0].path).toBe('gdrive://f2');
    });
  });

  describe('getDriveFileStream', () => {
    it('should return a stream', async () => {
      const driveService = await import('../../src/main/google-drive-service');
      const googleAuth = await import('../../src/main/google-auth');

      (googleAuth.getOAuth2Client as any).mockReturnValue({
        credentials: { refresh_token: 'valid' },
      });
      const mockStream = { pipe: vi.fn() };
      (mockDrive.files.get as any).mockResolvedValue({ data: mockStream });

      const stream = await driveService.getDriveFileStream('fileId');
      expect(stream).toBe(mockStream);
      expect(mockDrive.files.get).toHaveBeenCalledWith(
        expect.objectContaining({ fileId: 'fileId', alt: 'media' }),
        { responseType: 'stream' },
      );
    });
  });

  describe('getDriveFileMetadata', () => {
    it('should return metadata', async () => {
      const driveService = await import('../../src/main/google-drive-service');
      const googleAuth = await import('../../src/main/google-auth');

      (googleAuth.getOAuth2Client as any).mockReturnValue({
        credentials: { refresh_token: 'valid' },
      });
      const mockMeta = { id: 'fileId', size: '100' };
      (mockDrive.files.get as any).mockResolvedValue({ data: mockMeta });

      const meta = await driveService.getDriveFileMetadata('fileId');
      expect(meta).toBe(mockMeta);
    });
  });
});
