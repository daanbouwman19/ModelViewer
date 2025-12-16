import { describe, it, expect, vi, beforeEach } from 'vitest';
import os from 'os';

// Create hoisted mock for fs
const { readFileMock, writeFileMock } = vi.hoisted(() => ({
  readFileMock: vi.fn(),
  writeFileMock: vi.fn(),
}));

// We need to mock dependencies BEFORE importing the module under test
// to ensure module-level side effects (like singleton initialization) are controlled.
vi.mock('../../src/main/google-secrets');
vi.mock('fs/promises', () => ({
  default: {
    readFile: readFileMock,
    writeFile: writeFileMock,
  },
  readFile: readFileMock,
  writeFile: writeFileMock,
}));
vi.mock('googleapis', () => {
  return {
    google: {
      auth: {
        OAuth2: vi.fn().mockImplementation(() => ({
          setCredentials: vi.fn(),
          generateAuthUrl: vi.fn().mockReturnValue('http://auth-url'),
          getToken: vi
            .fn()
            .mockResolvedValue({ tokens: { access_token: 'abc' } }),
          credentials: { access_token: 'abc' },
        })),
      },
    },
  };
});

describe('google-auth coverage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    // Re-establish default mock behavior after clearing
    readFileMock.mockRejectedValue(new Error('Default error'));
  });

  it('getTokenPath fallback when error occurs', async () => {
    vi.spyOn(os, 'homedir').mockImplementation(() => {
      throw new Error('Fail');
    });

    readFileMock.mockRejectedValue(new Error('No file'));

    // Don't do vi.resetModules here, just use fresh mocks
    const googleAuth = await import('../../src/main/google-auth');
    // Mock secrets so getOAuth2Client works
    const googleSecrets = await import('../../src/main/google-secrets');
    (googleSecrets.getGoogleClientId as any).mockReturnValue('client-id');
    (googleSecrets.getGoogleClientSecret as any).mockReturnValue(
      'client-secret',
    );

    const result = await googleAuth.loadSavedCredentialsIfExist();
    expect(result).toBe(false);

    // When os.homedir() throws, getTokenPath() throws and fs.readFile is never called
    expect(readFileMock).not.toHaveBeenCalled();

    vi.restoreAllMocks(); // Restore os.homedir
  });

  it('getOAuth2Client throws if missing client ID', async () => {
    const googleSecrets = await import('../../src/main/google-secrets');
    (googleSecrets.getGoogleClientId as any).mockReturnValue(undefined);
    (googleSecrets.getGoogleClientSecret as any).mockReturnValue('secret');

    // reset modules to clear singleton
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
    // Mock process.versions
    const originalVersions = process.versions;
    Object.defineProperty(process, 'versions', {
      value: { ...originalVersions, electron: '1.0.0' },
      writable: true,
    });

    // Set up mocks before imports
    const googleSecrets = await import('../../src/main/google-secrets');
    (googleSecrets.getGoogleClientId as any).mockReturnValue('id');
    (googleSecrets.getGoogleClientSecret as any).mockReturnValue('secret');

    readFileMock.mockRejectedValue(new Error('No file'));

    // Import after secrets mock is set up
    const googleAuth = await import('../../src/main/google-auth');

    await googleAuth.loadSavedCredentialsIfExist();

    expect(readFileMock).toHaveBeenCalledWith(
      expect.stringContaining('.config/mediaplayer-app'),
      'utf-8',
    );

    // Restore
    Object.defineProperty(process, 'versions', { value: originalVersions });
  });

  it('getTokenPath uses default path if electron not present', async () => {
    // Mock process.versions to NOT have electron
    const originalVersions = process.versions;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { electron: _electron, ...others } = originalVersions as any;
    Object.defineProperty(process, 'versions', {
      value: others,
      writable: true,
    });

    // Set up mocks before imports
    const googleSecrets = await import('../../src/main/google-secrets');
    (googleSecrets.getGoogleClientId as any).mockReturnValue('id');
    (googleSecrets.getGoogleClientSecret as any).mockReturnValue('secret');

    readFileMock.mockRejectedValue(new Error('No file'));

    // Import after secrets mock is set up
    const googleAuth = await import('../../src/main/google-auth');

    await googleAuth.loadSavedCredentialsIfExist();

    // In the code, it falls back to the same path for Linux basically.
    // "userDataPath = path.join(os.homedir(), '.config', 'mediaplayer-app');"
    expect(readFileMock).toHaveBeenCalledWith(
      expect.stringContaining('.config/mediaplayer-app'),
      'utf-8',
    );

    Object.defineProperty(process, 'versions', { value: originalVersions });
  });
});

it('getTokenPath uses electron path if process.versions.electron exists', async () => {
  // Mock process.versions
  const originalVersions = process.versions;
  Object.defineProperty(process, 'versions', {
    value: { ...originalVersions, electron: '1.0.0' },
    writable: true,
  });

  // Set up mocks before imports
  const googleSecrets = await import('../../src/main/google-secrets');
  (googleSecrets.getGoogleClientId as any).mockReturnValue('id');
  (googleSecrets.getGoogleClientSecret as any).mockReturnValue('secret');

  readFileMock.mockRejectedValue(new Error('No file'));

  // Import after secrets mock is set up
  const googleAuth = await import('../../src/main/google-auth');

  await googleAuth.loadSavedCredentialsIfExist();

  expect(readFileMock).toHaveBeenCalledWith(
    expect.stringContaining('.config/mediaplayer-app'),
    'utf-8',
  );

  // Restore
  Object.defineProperty(process, 'versions', { value: originalVersions });
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
    expect.stringContaining('/custom/path'),
    'utf-8',
  );

  // cleanup
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
  // mock APPDATA
  process.env.APPDATA = 'C:\\Users\\Test\\AppData\\Roaming';

  vi.resetModules();
  const googleSecrets = await import('../../src/main/google-secrets');
  (googleSecrets.getGoogleClientId as any).mockReturnValue('id');
  (googleSecrets.getGoogleClientSecret as any).mockReturnValue('secret');
  readFileMock.mockRejectedValue(new Error('No file'));

  const googleAuth = await import('../../src/main/google-auth');
  await googleAuth.loadSavedCredentialsIfExist();

  // path.join with win32 separator or forward slash depending on environment running test?
  // Since we are on linux in CI usually, path.join behaves like linux.
  // BUT the code uses `path` module. If we want to test path.join behavior for win32 we'd ideally mock path.
  // However, let's see if we can just assert the string contains parts we expect.
  // In src/main/google-auth.ts, it uses `path` module.
  // The test environment is linux. So path.join will separate with `/`.
  // The code logic: process.env.APPDATA + appName. "C:\Users\Test\AppData\Roaming/mediaplayer-app" maybe?
  // Let's check expectation.
  expect(readFileMock).toHaveBeenCalledWith(
    expect.stringContaining('mediaplayer-app'),
    'utf-8',
  );
  // Also expecting APPDATA part
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

  // We need to spy on os.homedir for this one
  const homedirSpy = vi.spyOn(os, 'homedir').mockReturnValue('/Users/test');

  const googleAuth = await import('../../src/main/google-auth');
  await googleAuth.loadSavedCredentialsIfExist();

  expect(readFileMock).toHaveBeenCalledWith(
    expect.stringContaining(
      '/Users/test/Library/Application Support/mediaplayer-app',
    ),
    'utf-8',
  );

  Object.defineProperty(process, 'versions', { value: originalVersions });
  Object.defineProperty(process, 'platform', { value: originalPlatform });
  homedirSpy.mockRestore();
});

it('getTokenPath uses default path if electron not present', async () => {
  // Mock process.versions to NOT have electron
  const originalVersions = process.versions;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { electron: _electron, ...others } = originalVersions as any;
  Object.defineProperty(process, 'versions', {
    value: others,
    writable: true,
  });

  // Set up mocks before imports
  const googleSecrets = await import('../../src/main/google-secrets');
  (googleSecrets.getGoogleClientId as any).mockReturnValue('id');
  (googleSecrets.getGoogleClientSecret as any).mockReturnValue('secret');

  readFileMock.mockRejectedValue(new Error('No file'));

  // Import after secrets mock is set up
  const googleAuth = await import('../../src/main/google-auth');

  await googleAuth.loadSavedCredentialsIfExist();

  // In the code, it falls back to the same path for Linux basically.
  // "userDataPath = path.join(os.homedir(), '.config', 'mediaplayer-app');"
  expect(readFileMock).toHaveBeenCalledWith(
    expect.stringContaining('.config/mediaplayer-app'),
    'utf-8',
  );

  Object.defineProperty(process, 'versions', { value: originalVersions });
});

it('getTokenPath (Node) handles win32 platform', async () => {
  // No electron
  const originalVersions = process.versions;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { electron: _electron, ...others } = originalVersions as any;
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
  // No electron
  const originalVersions = process.versions;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { electron: _electron, ...others } = originalVersions as any;
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
    expect.stringContaining(
      '/Users/test/Library/Application Support/mediaplayer-app',
    ),
    'utf-8',
  );

  Object.defineProperty(process, 'versions', { value: originalVersions });
  Object.defineProperty(process, 'platform', { value: originalPlatform });
  homedirSpy.mockRestore();
});
