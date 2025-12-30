import { describe, expect, it, vi, beforeEach } from 'vitest';
import { WebAdapter } from '../../../src/renderer/api/WebAdapter';
import { runBackendContractTests } from './backend.contract';

const fetchMock = vi.fn();
global.fetch = fetchMock;

Object.defineProperty(window, 'location', {
  value: { port: '3000' },
  writable: true,
});

describe('WebAdapter', () => {
  runBackendContractTests(
    'WebAdapter',
    () => {
      vi.clearAllMocks();
      return new WebAdapter();
    },
    (method, result, error) => {
      if (method === 'loadFileAsDataURL') {
        return;
      }

      if (method === 'getServerPort') {
        Object.defineProperty(window, 'location', {
          value: { port: String(result) },
          writable: true,
        });
        return;
      }

      if (error) {
        fetchMock.mockResolvedValue({
          ok: false,
          status: 500,
          statusText: typeof error === 'string' ? error : 'Error',
          json: () => Promise.resolve({ error }),
          text: () =>
            Promise.resolve(typeof error === 'string' ? error : 'Error'),
        });
      } else {
        let mockJson = result;

        if (
          method === 'getParentDirectory' ||
          method === 'getGoogleDriveParent'
        ) {
          mockJson = { parent: result };
        }

        if (method === 'addGoogleDriveSource') {
          // Contract test expects { success: true, name }
          // API returns { name } (success is implied by 200 OK in WebAdapter logic)
          mockJson = { name: result.name };
        }

        fetchMock.mockResolvedValue({
          ok: true,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve(mockJson),
          text: () => Promise.resolve(mockJson),
        });
      }
    },
    { supportsVlc: false },
  );

  describe('Implementation Details', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('request handles 400 with JSON error message', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ error: 'Custom Error' }),
      });
      const adapter = new WebAdapter();
      await expect(adapter.addMediaDirectory('/path')).rejects.toThrow(
        'Custom Error',
      );
    });

    it('request handles 500 with non-JSON body', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.reject(new Error('Parse error')),
      });
      const adapter = new WebAdapter();
      await expect(adapter.addMediaDirectory('/path')).rejects.toThrow(
        'Internal Server Error',
      );
    });

    it('request handles 204 No Content (void return)', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        headers: { get: () => null },
      });
      const adapter = new WebAdapter();
      await expect(adapter.recordMediaView('/file')).resolves.toBeUndefined();
    });

    it('getVideoMetadata throws if duration is invalid', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ duration: 'invalid' }),
      });
      const adapter = new WebAdapter();
      await expect(adapter.getVideoMetadata('/file')).rejects.toThrow(
        'Failed to get video metadata',
      );
    });

    it('getRecentlyPlayed makes correct request', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve([{ id: 1, path: '/file.mp4' }]),
      });
      const adapter = new WebAdapter();
      const result = await adapter.getRecentlyPlayed(20);
      expect(result).toEqual([{ id: 1, path: '/file.mp4' }]);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/media/history?limit=20'),
        expect.anything(),
      );
    });

    it('getParentDirectory returns null on error', async () => {
      fetchMock.mockRejectedValue(new Error('Network error'));
      const adapter = new WebAdapter();
      const result = await adapter.getParentDirectory('/path');
      expect(result).toBeNull();
    });

    it('getGoogleDriveParent returns null on error', async () => {
      fetchMock.mockRejectedValue(new Error('Network error'));
      const adapter = new WebAdapter();
      const result = await adapter.getGoogleDriveParent('folder-id');
      expect(result).toBeNull();
    });

    it('getMetadata returns empty object on error', async () => {
      fetchMock.mockRejectedValue(new Error('Network error'));
      const adapter = new WebAdapter();
      const result = await adapter.getMetadata(['/path']);
      expect(result).toEqual({});
    });

    it('getSmartPlaylists returns empty array on error', async () => {
      fetchMock.mockRejectedValue(new Error('Network error'));
      const adapter = new WebAdapter();
      const result = await adapter.getSmartPlaylists();
      expect(result).toEqual([]);
    });

    it('addMediaDirectory returns null if no path provided', async () => {
      const adapter = new WebAdapter();
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = await adapter.addMediaDirectory();
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        'WebAdapter: Adding directory requires a path input.',
      );
      consoleSpy.mockRestore();
    });

    it('listGoogleDriveDirectory handles empty folderId (root)', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve([]),
      });
      const adapter = new WebAdapter();
      await adapter.listGoogleDriveDirectory('');
      // Check that query param is NOT present or is empty
      const url = fetchMock.mock.calls[0][0];
      expect(url).not.toContain('?folderId=');
    });

    it('listGoogleDriveDirectory handles provided folderId', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve([]),
      });
      const adapter = new WebAdapter();
      await adapter.listGoogleDriveDirectory('abc');
      const url = fetchMock.mock.calls[0][0];
      expect(url).toContain('?folderId=abc');
    });

    it('request preserves existing Content-Type header', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({}),
      });
      const adapter = new WebAdapter();
      // Access private request method via any cast or by using a public method that allows custom options if available.
      // Since request is private, we can't call it directly easily.
      // However, we can use a trick or just trust that standard methods validly set it.
      // But to test the 'if (!headers.has)' branch, we need to pass a header.
      // None of the public methods seem to pass custom headers from arguments.
      // We might need to cast to any to testing private method.
      await (adapter as any).request('/test', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
      });

      const options = fetchMock.mock.calls[0][1];
      expect(options.headers.get('Content-Type')).toBe('text/plain');
    });

    it('request handles JSON error without error property', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ message: 'Something wrong' }), // No .error field
      });
      const adapter = new WebAdapter();
      await expect(adapter.addMediaDirectory('/path')).rejects.toThrow(
        'Bad Request', // Should fallback to statusText or generic?
        // Code says: let errorMessage = res.statusText; if (err.error) ...
        // So it should be 'Bad Request'
      );
    });

    it('startGoogleDriveAuth handles text response', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        headers: { get: () => 'text/plain' },
        text: () => Promise.resolve('http://auth-url'),
      });
      const windowOpenSpy = vi
        .spyOn(window, 'open')
        .mockImplementation(() => null);

      const adapter = new WebAdapter();
      const url = await adapter.startGoogleDriveAuth();

      expect(url).toBe('http://auth-url');
      expect(windowOpenSpy).toHaveBeenCalled();
      windowOpenSpy.mockRestore();
    });
  });
});
