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

  describe('getDriveFileThumbnail', () => {
    it('should return thumbnail stream if link exists', async () => {
      const driveService = await import('../../src/main/google-drive-service');
      const googleAuth = await import('../../src/main/google-auth');

      (googleAuth.getOAuth2Client as any).mockReturnValue({
        credentials: { refresh_token: 'valid' },
        getAccessToken: vi.fn().mockResolvedValue({ token: 'access_token' }),
      });

      const mockMeta = {
        data: { thumbnailLink: 'http://thumb.link', mimeType: 'image/jpeg' },
      };
      (mockDrive.files.get as any).mockResolvedValue(mockMeta);

      // Create a proper Web ReadableStream using the ReadableStream constructor
      const mockBody = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        },
      });

      const mockFetchResponse = {
        ok: true,
        body: mockBody,
      };

      global.fetch = vi.fn().mockResolvedValue(mockFetchResponse);

      const stream = await driveService.getDriveFileThumbnail('fileId');

      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      expect(chunks.length).toBe(1);
      expect(chunks[0]).toEqual(Buffer.from([1, 2, 3]));
      expect(global.fetch).toHaveBeenCalledWith('http://thumb.link', {
        headers: { Authorization: 'Bearer access_token' },
      });
    });

    it('should throw if no thumbnail link', async () => {
      const driveService = await import('../../src/main/google-drive-service');
      const googleAuth = await import('../../src/main/google-auth');

      (googleAuth.getOAuth2Client as any).mockReturnValue({
        credentials: { refresh_token: 'valid' },
      });

      const mockMeta = { data: { thumbnailLink: null } }; // No link
      (mockDrive.files.get as any).mockResolvedValue(mockMeta);

      await expect(
        driveService.getDriveFileThumbnail('fileId'),
      ).rejects.toThrow('No thumbnail available');
    });

    it('should throw if fetch fails', async () => {
      const driveService = await import('../../src/main/google-drive-service');
      const googleAuth = await import('../../src/main/google-auth');

      (googleAuth.getOAuth2Client as any).mockReturnValue({
        credentials: { refresh_token: 'valid' },
        getAccessToken: vi.fn().mockResolvedValue({ token: 'access_token' }),
      });

      const mockMeta = {
        data: { thumbnailLink: 'http://thumb.link' },
      };
      (mockDrive.files.get as any).mockResolvedValue(mockMeta);

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Not Found',
      });

      await expect(
        driveService.getDriveFileThumbnail('fileId'),
      ).rejects.toThrow('Failed to fetch thumbnail: Not Found');
    });
  });

  describe('listDriveDirectory', () => {
    it('should list files and folders flatly', async () => {
      const driveService = await import('../../src/main/google-drive-service');
      const googleAuth = await import('../../src/main/google-auth');

      (googleAuth.getOAuth2Client as any).mockReturnValue({
        credentials: { refresh_token: 'valid' },
      });

      const mockFiles = [
        { id: 'f1', name: 'File.txt', mimeType: 'text/plain' },
        {
          id: 'd1',
          name: 'Folder',
          mimeType: 'application/vnd.google-apps.folder',
        },
      ];

      (mockDrive.files.list as any).mockResolvedValue({
        data: { files: mockFiles },
      });

      const result = await driveService.listDriveDirectory('root');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: 'File.txt',
        path: 'f1',
        isDirectory: false,
      });
      expect(result[1]).toEqual({
        name: 'Folder',
        path: 'd1',
        isDirectory: true,
      });
      expect(mockDrive.files.list).toHaveBeenCalledWith(
        expect.objectContaining({ q: "'root' in parents and trashed = false" }),
      );
    });

    it('should handle errors', async () => {
      const driveService = await import('../../src/main/google-drive-service');
      (mockDrive.files.list as any).mockRejectedValue(new Error('API Error'));
      await expect(driveService.listDriveDirectory('root')).rejects.toThrow(
        'API Error',
      );
    });
  });

  describe('getDriveParent', () => {
    it('should return parent id', async () => {
      const driveService = await import('../../src/main/google-drive-service');
      (mockDrive.files.get as any).mockResolvedValue({
        data: { parents: ['parentId'] },
      });

      const parent = await driveService.getDriveParent('childId');
      expect(parent).toBe('parentId');
      expect(mockDrive.files.get).toHaveBeenCalledWith(
        expect.objectContaining({ fileId: 'childId', fields: 'parents' }),
      );
    });

    it('should return null if no parents', async () => {
      const driveService = await import('../../src/main/google-drive-service');
      (mockDrive.files.get as any).mockResolvedValue({
        data: { parents: [] },
      });
      const parent = await driveService.getDriveParent('childId');
      expect(parent).toBeNull();
    });

    it('should return null for root', async () => {
      const driveService = await import('../../src/main/google-drive-service');
      const parent = await driveService.getDriveParent('root');
      expect(parent).toBeNull();
    });

    it('should return null on error', async () => {
      const driveService = await import('../../src/main/google-drive-service');
      (mockDrive.files.get as any).mockRejectedValue(new Error('API Error'));
      const parent = await driveService.getDriveParent('childId');
      expect(parent).toBeNull();
    });
  });
});
