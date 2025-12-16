import { describe, it, expect, vi, beforeEach } from 'vitest';
import { google } from 'googleapis';

vi.mock('../../src/main/google-auth');
vi.mock('googleapis');

const mockDrive = {
  files: {
    list: vi.fn(),
    get: vi.fn(),
  },
};

(google.drive as any).mockReturnValue(mockDrive);

describe('Google Drive Service Coverage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('getDriveClient returns existing client (memoization)', async () => {
    const driveService = await import('../../src/main/google-drive-service');
    const googleAuth = await import('../../src/main/google-auth');
    (googleAuth.getOAuth2Client as any).mockReturnValue({
      credentials: { refresh_token: 'valid' },
    });

    const client1 = await driveService.getDriveClient();
    const client2 = await driveService.getDriveClient();

    expect(client1).toBe(client2);
    expect(google.drive).toHaveBeenCalledTimes(1);
  });

  it('listDriveFiles handles undefined files in response', async () => {
    const driveService = await import('../../src/main/google-drive-service');
    const googleAuth = await import('../../src/main/google-auth');
    (googleAuth.getOAuth2Client as any).mockReturnValue({
      credentials: { refresh_token: 'valid' },
    });

    const listMock = mockDrive.files.list as any;
    // 1. Root files - return empty/undefined
    listMock.mockResolvedValueOnce({ data: {} });
    // 2. Root folders - return empty
    listMock.mockResolvedValueOnce({ data: { files: [] } });

    const result = await driveService.listDriveFiles('root');
    expect(result.textures).toEqual([]);
  });

  it('listDriveFiles defaults names', async () => {
    const driveService = await import('../../src/main/google-drive-service');
    const googleAuth = await import('../../src/main/google-auth');
    (googleAuth.getOAuth2Client as any).mockReturnValue({
      credentials: { refresh_token: 'valid' },
    });

    const listMock = mockDrive.files.list as any;
    listMock.mockResolvedValueOnce({ data: { files: [{ id: 'f1' }] } }); // No name
    listMock.mockResolvedValueOnce({ data: { files: [{ id: 'sub1' }] } }); // Subfolder no name
    listMock.mockResolvedValueOnce({ data: { files: [] } }); // Subfolder content
    listMock.mockResolvedValueOnce({ data: { files: [] } }); // Subfolder folders

    const result = await driveService.listDriveFiles('root');
    expect(result.textures[0].name).toBe('Untitled');
    expect(result.children[0].name).toBe('Untitled Folder');
  });
});
