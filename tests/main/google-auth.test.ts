import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'os';
import path from 'path';

// Don't import fs directly, import the mock target or use the mock object
import * as googleAuth from '../../src/main/google-auth';

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/user/data'),
  },
}));

// Mock google-secrets
vi.mock('../../src/main/google-secrets', () => ({
  getGoogleClientId: vi.fn(() => 'mock-client-id'),
  getGoogleClientSecret: vi.fn(() => 'mock-client-secret'),
  getGoogleRedirectUri: vi.fn(() => 'http://localhost:12345/auth/callback'),
}));

// Hoist mock variables
const { readFileMock, writeFileMock, mockOAuth2Client, MockOAuth2 } =
  vi.hoisted(() => {
    const readFileMock = vi.fn();
    const writeFileMock = vi.fn();
    const mockOAuth2Client = {
      setCredentials: vi.fn(),
      generateAuthUrl: vi.fn(),
      getToken: vi.fn(),
      credentials: { refresh_token: 'mock-refresh-token' },
    };
    // Ensure constructible
    const MockOAuth2 = vi.fn(function () {
      return mockOAuth2Client;
    });
    return { readFileMock, writeFileMock, mockOAuth2Client, MockOAuth2 };
  });

// Mock fs/promises
vi.mock('fs/promises', () => ({
  default: {
    readFile: readFileMock,
    writeFile: writeFileMock,
    mkdir: vi.fn(),
  },
  readFile: readFileMock,
  writeFile: writeFileMock,
  mkdir: vi.fn(),
}));

vi.mock('googleapis', () => {
  return {
    google: {
      auth: {
        OAuth2: MockOAuth2,
      },
    },
  };
});

describe('Google Auth Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_CLIENT_ID = 'mock-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'mock-client-secret';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/callback';
  });

  afterEach(() => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REDIRECT_URI;
  });

  describe('getOAuth2Client', () => {
    it('should create and return a singleton client', () => {
      const client1 = googleAuth.getOAuth2Client();
      const client2 = googleAuth.getOAuth2Client();
      expect(client1).toBe(mockOAuth2Client);
      expect(client2).toBe(client1);
      expect(MockOAuth2).toHaveBeenCalled();
    });
  });

  describe('loadSavedCredentialsIfExist', () => {
    it('should load credentials from file', async () => {
      const mockCreds = { refresh_token: 'saved-token' };
      readFileMock.mockResolvedValue(JSON.stringify(mockCreds));

      const result = await googleAuth.loadSavedCredentialsIfExist();

      expect(result).toBe(true);
      expect(readFileMock).toHaveBeenCalledWith(
        expect.stringContaining('google-token.json'),
        'utf-8',
      );
      expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith(mockCreds);
    });

    it('should return false if file does not exist', async () => {
      readFileMock.mockRejectedValue(new Error('ENOENT'));

      const result = await googleAuth.loadSavedCredentialsIfExist();

      expect(result).toBe(false);
      expect(mockOAuth2Client.setCredentials).not.toHaveBeenCalled();
    });
  });

  describe('saveCredentials', () => {
    it('should save credentials to file', async () => {
      readFileMock.mockResolvedValue('{}');

      await googleAuth.saveCredentials(mockOAuth2Client as any);

      expect(writeFileMock).toHaveBeenCalledWith(
        expect.stringContaining('google-token.json'),
        JSON.stringify(mockOAuth2Client.credentials),
      );
    });
  });

  describe('generateAuthUrl', () => {
    it('should call generateAuthUrl on client', () => {
      mockOAuth2Client.generateAuthUrl.mockReturnValue('http://auth-url');
      const url = googleAuth.generateAuthUrl();
      expect(url).toBe('http://auth-url');
      expect(mockOAuth2Client.generateAuthUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          access_type: 'offline',
          scope: expect.any(Array),
        }),
      );
    });
  });

  describe('authenticateWithCode', () => {
    it('should exchange code for tokens and save them', async () => {
      const mockTokens = { refresh_token: 'new-token' };
      mockOAuth2Client.getToken.mockResolvedValue({ tokens: mockTokens });
      readFileMock.mockResolvedValue('{}');

      await googleAuth.authenticateWithCode('test-code');

      expect(mockOAuth2Client.getToken).toHaveBeenCalledWith('test-code');
      expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith(mockTokens);
      expect(writeFileMock).toHaveBeenCalled();
    });
  });
});

describe('google-auth coverage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    readFileMock.mockRejectedValue(new Error('Default error'));
  });

  it('getTokenPath fallback when error occurs', async () => {
    vi.spyOn(os, 'homedir').mockImplementation(() => {
      throw new Error('Fail');
    });

    const originalAppData = process.env.APPDATA;
    delete process.env.APPDATA;

    readFileMock.mockRejectedValue(new Error('No file'));

    const googleAuth = await import('../../src/main/google-auth');
    const googleSecrets = await import('../../src/main/google-secrets');
    (googleSecrets.getGoogleClientId as any).mockReturnValue('client-id');
    (googleSecrets.getGoogleClientSecret as any).mockReturnValue(
      'client-secret',
    );

    const result = await googleAuth.loadSavedCredentialsIfExist();
    expect(result).toBe(false);

    expect(readFileMock).not.toHaveBeenCalled();

    vi.restoreAllMocks();
    process.env.APPDATA = originalAppData;
  });

  it('getOAuth2Client throws if missing client ID', async () => {
    const googleSecrets = await import('../../src/main/google-secrets');
    (googleSecrets.getGoogleClientId as any).mockReturnValue(undefined);
    (googleSecrets.getGoogleClientSecret as any).mockReturnValue('secret');

    vi.resetModules();
    const googleAuth = await import('../../src/main/google-auth');

    expect(() => googleAuth.getOAuth2Client()).toThrow(
      'Google OAuth credentials not configured',
    );
  });

  it('getOAuth2Client throws if missing client Secret', async () => {
    const googleSecrets = await import('../../src/main/google-secrets');
    (googleSecrets.getGoogleClientId as any).mockReturnValue('id');
    (googleSecrets.getGoogleClientSecret as any).mockReturnValue(undefined);

    vi.resetModules();
    const googleAuth = await import('../../src/main/google-auth');

    expect(() => googleAuth.getOAuth2Client()).toThrow(
      'Google OAuth credentials not configured',
    );
  });

  it('getTokenPath uses electron path if process.versions.electron exists', async () => {
    const originalVersions = process.versions;
    Object.defineProperty(process, 'versions', {
      value: { ...originalVersions, electron: '1.0.0' },
      writable: true,
    });

    const googleSecrets = await import('../../src/main/google-secrets');
    (googleSecrets.getGoogleClientId as any).mockReturnValue('id');
    (googleSecrets.getGoogleClientSecret as any).mockReturnValue('secret');

    readFileMock.mockRejectedValue(new Error('No file'));

    const googleAuth = await import('../../src/main/google-auth');

    await googleAuth.loadSavedCredentialsIfExist();

    expect(readFileMock).toHaveBeenCalledWith(
      expect.stringContaining('mediaplayer-app'),
      'utf-8',
    );

    Object.defineProperty(process, 'versions', { value: originalVersions });
  });

  it('getTokenPath uses default path if electron not present', async () => {
    const originalVersions = process.versions;
    const others = { ...originalVersions } as any;
    delete others.electron;
    Object.defineProperty(process, 'versions', {
      value: others,
      writable: true,
    });

    const googleSecrets = await import('../../src/main/google-secrets');
    (googleSecrets.getGoogleClientId as any).mockReturnValue('id');
    (googleSecrets.getGoogleClientSecret as any).mockReturnValue('secret');

    readFileMock.mockRejectedValue(new Error('No file'));

    const googleAuth = await import('../../src/main/google-auth');

    await googleAuth.loadSavedCredentialsIfExist();

    expect(readFileMock).toHaveBeenCalledWith(
      expect.stringContaining('mediaplayer-app'),
      'utf-8',
    );

    Object.defineProperty(process, 'versions', { value: originalVersions });
  });
});

it('getTokenPath (Electron) uses ELECTRON_USER_DATA if set', async () => {
  const originalVersions = process.versions;
  Object.defineProperty(process, 'versions', {
    value: { ...originalVersions, electron: '1.0.0' },
    writable: true,
  });
  process.env.ELECTRON_USER_DATA = '/custom/path';

  vi.resetModules();
  const googleSecrets = await import('../../src/main/google-secrets');
  (googleSecrets.getGoogleClientId as any).mockReturnValue('id');
  (googleSecrets.getGoogleClientSecret as any).mockReturnValue('secret');

  readFileMock.mockRejectedValue(new Error('No file'));

  const googleAuth = await import('../../src/main/google-auth');
  await googleAuth.loadSavedCredentialsIfExist();

  expect(readFileMock).toHaveBeenCalledWith(
    expect.stringContaining(path.normalize('/custom/path')),
    'utf-8',
  );

  delete process.env.ELECTRON_USER_DATA;
  Object.defineProperty(process, 'versions', { value: originalVersions });
});

it('getTokenPath (Electron) handles win32 platform', async () => {
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
  const googleSecrets = await import('../../src/main/google-secrets');
  (googleSecrets.getGoogleClientId as any).mockReturnValue('id');
  (googleSecrets.getGoogleClientSecret as any).mockReturnValue('secret');
  readFileMock.mockRejectedValue(new Error('No file'));

  const googleAuth = await import('../../src/main/google-auth');
  await googleAuth.loadSavedCredentialsIfExist();

  expect(readFileMock).toHaveBeenCalledWith(
    expect.stringContaining('mediaplayer-app'),
    'utf-8',
  );
  expect(readFileMock).toHaveBeenCalledWith(
    expect.stringContaining('C:\\Users\\Test\\AppData\\Roaming'),
    'utf-8',
  );

  Object.defineProperty(process, 'versions', { value: originalVersions });
  Object.defineProperty(process, 'platform', { value: originalPlatform });
  delete process.env.APPDATA;
});

it('getTokenPath (Electron) handles darwin platform', async () => {
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

  vi.resetModules();
  const googleSecrets = await import('../../src/main/google-secrets');
  (googleSecrets.getGoogleClientId as any).mockReturnValue('id');
  (googleSecrets.getGoogleClientSecret as any).mockReturnValue('secret');

  readFileMock.mockRejectedValue(new Error('No file'));

  const homedirSpy = vi.spyOn(os, 'homedir').mockReturnValue('/Users/test');

  const googleAuth = await import('../../src/main/google-auth');
  await googleAuth.loadSavedCredentialsIfExist();

  expect(readFileMock).toHaveBeenCalledWith(
    expect.stringContaining('mediaplayer-app'),
    'utf-8',
  );

  Object.defineProperty(process, 'versions', { value: originalVersions });
  Object.defineProperty(process, 'platform', { value: originalPlatform });
  homedirSpy.mockRestore();
});

it('getTokenPath (Node) handles win32 platform', async () => {
  const originalVersions = process.versions;
  const others = { ...originalVersions } as any;
  delete others.electron;
  Object.defineProperty(process, 'versions', {
    value: others,
    writable: true,
  });
  const originalPlatform = process.platform;
  Object.defineProperty(process, 'platform', {
    value: 'win32',
    writable: true,
  });
  process.env.APPDATA = 'C:\\Users\\Test\\AppData\\Roaming';

  vi.resetModules();
  const googleSecrets = await import('../../src/main/google-secrets');
  (googleSecrets.getGoogleClientId as any).mockReturnValue('id');
  (googleSecrets.getGoogleClientSecret as any).mockReturnValue('secret');
  readFileMock.mockRejectedValue(new Error('No file'));

  const googleAuth = await import('../../src/main/google-auth');
  await googleAuth.loadSavedCredentialsIfExist();

  expect(readFileMock).toHaveBeenCalledWith(
    expect.stringContaining('C:\\Users\\Test\\AppData\\Roaming'),
    'utf-8',
  );

  Object.defineProperty(process, 'versions', { value: originalVersions });
  Object.defineProperty(process, 'platform', { value: originalPlatform });
  delete process.env.APPDATA;
});

it('getTokenPath (Node) handles darwin platform', async () => {
  const originalVersions = process.versions;
  const others = { ...originalVersions } as any;
  delete others.electron;
  Object.defineProperty(process, 'versions', {
    value: others,
    writable: true,
  });
  const originalPlatform = process.platform;
  Object.defineProperty(process, 'platform', {
    value: 'darwin',
    writable: true,
  });

  vi.resetModules();
  const googleSecrets = await import('../../src/main/google-secrets');
  (googleSecrets.getGoogleClientId as any).mockReturnValue('id');
  (googleSecrets.getGoogleClientSecret as any).mockReturnValue('secret');

  readFileMock.mockRejectedValue(new Error('No file'));
  const homedirSpy = vi.spyOn(os, 'homedir').mockReturnValue('/Users/test');

  const googleAuth = await import('../../src/main/google-auth');
  await googleAuth.loadSavedCredentialsIfExist();

  expect(readFileMock).toHaveBeenCalledWith(
    expect.stringContaining('mediaplayer-app'),
    'utf-8',
  );

  Object.defineProperty(process, 'versions', { value: originalVersions });
  Object.defineProperty(process, 'platform', { value: originalPlatform });
  homedirSpy.mockRestore();
});

it('getTokenPath uses GOOGLE_TOKEN_PATH env var if set', async () => {
  process.env.GOOGLE_TOKEN_PATH = '/custom/env/path/google-token.json';

  vi.resetModules();
  // We need to re-import checking behaviour
  const googleSecrets = await import('../../src/main/google-secrets');
  (googleSecrets.getGoogleClientId as any).mockReturnValue('id');
  (googleSecrets.getGoogleClientSecret as any).mockReturnValue('secret');
  readFileMock.mockRejectedValue(new Error('No file'));

  const googleAuth = await import('../../src/main/google-auth');
  await googleAuth.loadSavedCredentialsIfExist();

  expect(readFileMock).toHaveBeenCalledWith(
    path.normalize('/custom/env/path/google-token.json'),
    'utf-8',
  );

  delete process.env.GOOGLE_TOKEN_PATH;
});
