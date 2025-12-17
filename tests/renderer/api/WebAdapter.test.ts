import { describe, expect, it, vi } from 'vitest';
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
  });
});
