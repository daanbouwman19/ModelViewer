import { describe, it, expect, vi, beforeEach } from 'vitest';
import os from 'os';
import path from 'path';

// Create hoisted mock for fs
const { readFileMock, writeFileMock } = vi.hoisted(() => ({
  readFileMock: vi.fn(),
  writeFileMock: vi.fn(),
}));

// Mock Google APIs
vi.mock('googleapis', () => {
  class OAuth2Mock {
    credentials: any;
    constructor() {
      this.credentials = { access_token: 'abc' };
    }
    setCredentials = vi.fn();
    generateAuthUrl = vi.fn().mockReturnValue('http://auth-url');
    getToken = vi.fn().mockResolvedValue({ tokens: { access_token: 'abc' } });
  }

  return {
    google: {
      auth: {
        OAuth2: OAuth2Mock,
      },
    },
  };
});

// We need to mock dependencies BEFORE importing the module under test
vi.mock('../../src/main/google-secrets');
vi.mock('fs/promises', () => ({
  default: {
    readFile: readFileMock,
    writeFile: writeFileMock,
  },
  readFile: readFileMock,
  writeFile: writeFileMock,
}));

describe('Google Auth', () => {
  let googleAuth: typeof import('../../src/main/google-auth');
  let googleSecrets: typeof import('../../src/main/google-secrets');

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    readFileMock.mockRejectedValue(new Error('No file')); // Default: no saved token

    googleSecrets = await import('../../src/main/google-secrets');
    // Default valid secrets
    (googleSecrets.getGoogleClientId as any).mockReturnValue('client-id');
    (googleSecrets.getGoogleClientSecret as any).mockReturnValue(
      'client-secret',
    );
    // Ensure redirect URI is also mocked if used
    if ((googleSecrets as any).getGoogleRedirectUri) {
      (googleSecrets as any).getGoogleRedirectUri.mockReturnValue(
        'http://localhost',
      );
    }

    googleAuth = await import('../../src/main/google-auth');
  });

  describe('Token Path Resolution', () => {
    it('uses electron path if process.versions.electron exists', async () => {
      const originalVersions = process.versions;
      Object.defineProperty(process, 'versions', {
        value: { ...originalVersions, electron: '1.0.0' },
        writable: true,
      });

      await googleAuth.loadSavedCredentialsIfExist();

      expect(readFileMock).toHaveBeenCalledWith(
        expect.stringContaining('mediaplayer-app'),
        'utf-8',
      );

      Object.defineProperty(process, 'versions', { value: originalVersions });
    });

    it('uses default path if electron not present', async () => {
      const originalVersions = process.versions;
      const { electron: _electron, ...others } = originalVersions as any; // eslint-disable-line @typescript-eslint/no-unused-vars
      Object.defineProperty(process, 'versions', {
        value: others,
        writable: true,
      });

      await googleAuth.loadSavedCredentialsIfExist();

      expect(readFileMock).toHaveBeenCalledWith(
        expect.stringContaining('mediaplayer-app'),
        'utf-8',
      );

      Object.defineProperty(process, 'versions', { value: originalVersions });
    });

    it('uses ELECTRON_USER_DATA if set (Electron)', async () => {
      const originalVersions = process.versions;
      Object.defineProperty(process, 'versions', {
        value: { ...originalVersions, electron: '1.0.0' },
        writable: true,
      });
      process.env.ELECTRON_USER_DATA = '/custom/path';

      vi.resetModules();
      googleAuth = await import('../../src/main/google-auth');

      await googleAuth.loadSavedCredentialsIfExist();

      expect(readFileMock).toHaveBeenCalledWith(
        expect.stringContaining(path.normalize('/custom/path')),
        'utf-8',
      );

      delete process.env.ELECTRON_USER_DATA;
      Object.defineProperty(process, 'versions', { value: originalVersions });
    });

    it('handles win32 platform (Electron)', async () => {
      const originalVersions = process.versions;
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'versions', {
        value: { ...originalVersions, electron: '1.0.0' },
        writable: true,
      });
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
      });
      process.env.APPDATA = 'C:\\Users\\Test\\AppData\\Roaming';

      vi.resetModules();
      googleAuth = await import('../../src/main/google-auth');

      await googleAuth.loadSavedCredentialsIfExist();

      expect(readFileMock).toHaveBeenCalledWith(
        expect.stringContaining('C:\\Users\\Test\\AppData\\Roaming'),
        'utf-8',
      );

      Object.defineProperty(process, 'versions', { value: originalVersions });
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      delete process.env.APPDATA;
    });

    it('handles darwin platform (Electron)', async () => {
      const originalVersions = process.versions;
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'versions', {
        value: { ...originalVersions, electron: '1.0.0' },
        writable: true,
      });
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        writable: true,
      });
      const homedirSpy = vi.spyOn(os, 'homedir').mockReturnValue('/Users/test');

      vi.resetModules();
      googleAuth = await import('../../src/main/google-auth');

      await googleAuth.loadSavedCredentialsIfExist();

      expect(readFileMock).toHaveBeenCalledWith(
        expect.stringContaining('mediaplayer-app'),
        'utf-8',
      );

      Object.defineProperty(process, 'versions', { value: originalVersions });
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      homedirSpy.mockRestore();
    });

    it('handles win32 platform (Node)', async () => {
      const originalVersions = process.versions;
      const originalPlatform = process.platform;
      const { electron: _electron, ...others } = originalVersions as any; // eslint-disable-line @typescript-eslint/no-unused-vars
      Object.defineProperty(process, 'versions', {
        value: others,
        writable: true,
      });
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
      });
      process.env.APPDATA = 'C:\\Users\\Test\\AppData\\Roaming';

      vi.resetModules();
      googleAuth = await import('../../src/main/google-auth');

      await googleAuth.loadSavedCredentialsIfExist();

      expect(readFileMock).toHaveBeenCalledWith(
        expect.stringContaining('C:\\Users\\Test\\AppData\\Roaming'),
        'utf-8',
      );

      Object.defineProperty(process, 'versions', { value: originalVersions });
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      delete process.env.APPDATA;
    });

    it('handles darwin platform (Node)', async () => {
      const originalVersions = process.versions;
      const originalPlatform = process.platform;
      const { electron: _electron, ...others } = originalVersions as any; // eslint-disable-line @typescript-eslint/no-unused-vars
      Object.defineProperty(process, 'versions', {
        value: others,
        writable: true,
      });
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        writable: true,
      });
      const homedirSpy = vi.spyOn(os, 'homedir').mockReturnValue('/Users/test');

      vi.resetModules();
      googleAuth = await import('../../src/main/google-auth');

      await googleAuth.loadSavedCredentialsIfExist();

      expect(readFileMock).toHaveBeenCalledWith(
        expect.stringContaining('mediaplayer-app'),
        'utf-8',
      );

      Object.defineProperty(process, 'versions', { value: originalVersions });
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      homedirSpy.mockRestore();
    });

    it('fallback when os.homedir() error occurs', async () => {
      vi.spyOn(os, 'homedir').mockImplementation(() => {
        throw new Error('Fail');
      });
      const originalAppData = process.env.APPDATA;
      delete process.env.APPDATA;

      // When getTokenPath fails, loadSavedCredentialsIfExist returns false and catches error
      const result = await googleAuth.loadSavedCredentialsIfExist();
      expect(result).toBe(false);
      expect(readFileMock).not.toHaveBeenCalled();

      vi.restoreAllMocks();
      process.env.APPDATA = originalAppData;
    });
  });

  describe('OAuth Client Configuration', () => {
    it('throws if missing client ID', async () => {
      (googleSecrets.getGoogleClientId as any).mockReturnValue(undefined);
      vi.resetModules();
      googleAuth = await import('../../src/main/google-auth');

      expect(() => googleAuth.getOAuth2Client()).toThrow(
        'Google OAuth credentials not configured',
      );
    });

    it('throws if missing client Secret', async () => {
      (googleSecrets.getGoogleClientSecret as any).mockReturnValue(undefined);
      vi.resetModules();
      googleAuth = await import('../../src/main/google-auth');

      expect(() => googleAuth.getOAuth2Client()).toThrow(
        'Google OAuth credentials not configured',
      );
    });
  });

  describe('Authentication Flow', () => {
    it('startGoogleDriveAuth returns auth URL', () => {
      const url = googleAuth.generateAuthUrl();
      expect(url).toBe('http://auth-url');
    });

    it('handleGoogleDriveCallback exchanges code for token', async () => {
      const result = await googleAuth.authenticateWithCode('test-code');
      expect(result).toBe(undefined);
      expect(writeFileMock).toHaveBeenCalled();
    });

    it('loadSavedCredentialsIfExist returns true if token file exists', async () => {
      readFileMock.mockResolvedValue(JSON.stringify({ access_token: '123' }));
      const result = await googleAuth.loadSavedCredentialsIfExist();
      expect(result).toBe(true);
    });

    it('loadSavedCredentialsIfExist returns false if token file missing', async () => {
      readFileMock.mockRejectedValue(new Error('ENOENT'));
      const result = await googleAuth.loadSavedCredentialsIfExist();
      expect(result).toBe(false);
    });
  });
});
