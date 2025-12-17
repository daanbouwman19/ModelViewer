import { describe, vi } from 'vitest';
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
});
