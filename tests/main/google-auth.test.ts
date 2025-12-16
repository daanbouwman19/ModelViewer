import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { app } from 'electron';
// Don't import fs directly, import the mock target or use the mock object
import * as googleAuth from '../../src/main/google-auth';

// Mock electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/user/data'),
  },
}));

// Hoist mock variables
const { readFileMock, writeFileMock, mockOAuth2Client, MockOAuth2 } = vi.hoisted(() => {
  const readFileMock = vi.fn();
  const writeFileMock = vi.fn();
  const mockOAuth2Client = {
    setCredentials: vi.fn(),
    generateAuthUrl: vi.fn(),
    getToken: vi.fn(),
    credentials: { refresh_token: 'mock-refresh-token' },
  };
  // Ensure constructible
  const MockOAuth2 = vi.fn(function() { return mockOAuth2Client; });
  return { readFileMock, writeFileMock, mockOAuth2Client, MockOAuth2 };
});

// Mock fs/promises
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
        OAuth2: MockOAuth2,
      },
    },
  };
});

describe('Google Auth Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      expect(readFileMock).toHaveBeenCalledWith(expect.stringContaining('google-token.json'), 'utf-8');
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
        JSON.stringify(mockOAuth2Client.credentials)
      );
    });
  });

  describe('generateAuthUrl', () => {
    it('should call generateAuthUrl on client', () => {
      mockOAuth2Client.generateAuthUrl.mockReturnValue('http://auth-url');
      const url = googleAuth.generateAuthUrl();
      expect(url).toBe('http://auth-url');
      expect(mockOAuth2Client.generateAuthUrl).toHaveBeenCalledWith(expect.objectContaining({
        access_type: 'offline',
        scope: expect.any(Array),
      }));
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
