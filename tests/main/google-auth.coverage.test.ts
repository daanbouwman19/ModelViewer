import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';

// We need to mock dependencies BEFORE importing the module under test
// to ensure module-level side effects (like singleton initialization) are controlled.
vi.mock('../../src/main/google-secrets');
vi.mock('fs/promises');
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
  });

  it('getTokenPath fallback when error occurs', async () => {
    vi.spyOn(os, 'homedir').mockImplementation(() => {
      throw new Error('Fail');
    });
    const fsReadFileSpy = vi
      .spyOn(fs, 'readFile')
      .mockRejectedValue(new Error('No file'));

    // Dynamic import to ensure fresh execution of module scope if any
    const googleAuth = await import('../../src/main/google-auth');
    // Mock secrets so getOAuth2Client works
    const googleSecrets = await import('../../src/main/google-secrets');
    (googleSecrets.getGoogleClientId as any).mockReturnValue('client-id');
    (googleSecrets.getGoogleClientSecret as any).mockReturnValue(
      'client-secret',
    );

    const result = await googleAuth.loadSavedCredentialsIfExist();
    expect(result).toBe(false);

    expect(fsReadFileSpy).toHaveBeenCalledWith(
      expect.stringContaining('.media-player'),
      'utf-8',
    );

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

    const fsReadFileSpy = vi
      .spyOn(fs, 'readFile')
      .mockRejectedValue(new Error('No file'));

    vi.resetModules();
    const googleAuth = await import('../../src/main/google-auth');
    const googleSecrets = await import('../../src/main/google-secrets');
    (googleSecrets.getGoogleClientId as any).mockReturnValue('id');
    (googleSecrets.getGoogleClientSecret as any).mockReturnValue('secret');

    await googleAuth.loadSavedCredentialsIfExist();

    expect(fsReadFileSpy).toHaveBeenCalledWith(
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

    const fsReadFileSpy = vi
      .spyOn(fs, 'readFile')
      .mockRejectedValue(new Error('No file'));

    vi.resetModules();
    const googleAuth = await import('../../src/main/google-auth');
    const googleSecrets = await import('../../src/main/google-secrets');
    (googleSecrets.getGoogleClientId as any).mockReturnValue('id');
    (googleSecrets.getGoogleClientSecret as any).mockReturnValue('secret');

    await googleAuth.loadSavedCredentialsIfExist();

    // In the code, it falls back to the same path for Linux basically.
    // "userDataPath = path.join(os.homedir(), '.config', 'mediaplayer-app');"
    expect(fsReadFileSpy).toHaveBeenCalledWith(
      expect.stringContaining('.config/mediaplayer-app'),
      'utf-8',
    );

    Object.defineProperty(process, 'versions', { value: originalVersions });
  });
});
