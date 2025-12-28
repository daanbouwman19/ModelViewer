import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../../src/main/google-secrets', () => ({
  getGoogleClientId: vi.fn(() => 'mock-client-id'),
  getGoogleClientSecret: vi.fn(() => 'mock-client-secret'),
  getGoogleRedirectUri: vi.fn(() => 'http://localhost:12345/auth/callback'),
}));

vi.mock('../../src/main/database', () => ({
  getSetting: vi.fn(),
  saveSetting: vi.fn(),
}));

// Hoist mock variables
const { mockOAuth2Client, MockOAuth2 } = vi.hoisted(() => {
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
  return { mockOAuth2Client, MockOAuth2 };
});

vi.mock('googleapis', () => {
  return {
    google: {
      auth: {
        OAuth2: MockOAuth2,
      },
    },
  };
});

import * as googleAuth from '../../src/main/google-auth';
import * as database from '../../src/main/database';

describe('Google Auth Service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
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
    it('should load credentials from database', async () => {
      const mockCreds = { refresh_token: 'saved-token' };
      vi.mocked(database.getSetting).mockResolvedValue(
        JSON.stringify(mockCreds),
      );

      const result = await googleAuth.loadSavedCredentialsIfExist();

      expect(result).toBe(true);
      expect(database.getSetting).toHaveBeenCalledWith('google_tokens');
      expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith(mockCreds);
    });

    it('should return false if setting does not exist', async () => {
      vi.mocked(database.getSetting).mockResolvedValue(null);

      const result = await googleAuth.loadSavedCredentialsIfExist();

      expect(result).toBe(false);
      expect(mockOAuth2Client.setCredentials).not.toHaveBeenCalled();
    });

    it('should return false on database error', async () => {
      vi.mocked(database.getSetting).mockRejectedValue(new Error('DB Error'));

      const result = await googleAuth.loadSavedCredentialsIfExist();

      expect(result).toBe(false);
      expect(mockOAuth2Client.setCredentials).not.toHaveBeenCalled();
    });
  });

  describe('saveCredentials', () => {
    it('should save credentials to database', async () => {
      await googleAuth.saveCredentials(mockOAuth2Client as any);

      expect(database.saveSetting).toHaveBeenCalledWith(
        'google_tokens',
        JSON.stringify(mockOAuth2Client.credentials),
      );
    });

    it('should propagate database errors', async () => {
      vi.mocked(database.saveSetting).mockRejectedValue(
        new Error('Write fail'),
      );
      await expect(
        googleAuth.saveCredentials(mockOAuth2Client as any),
      ).rejects.toThrow('Write fail');
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

      await googleAuth.authenticateWithCode('test-code');

      expect(mockOAuth2Client.getToken).toHaveBeenCalledWith('test-code');
      expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith(mockTokens);
      expect(database.saveSetting).toHaveBeenCalled();
    });
  });
});
