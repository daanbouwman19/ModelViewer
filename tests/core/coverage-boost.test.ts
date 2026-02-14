
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MediaHandler } from '../../src/core/media-handler';
import { MediaService } from '../../src/core/media-service';
import { MediaRepository } from '../../src/core/repositories/media-repository';
import { EventEmitter } from 'events';

// Hoist the mock implementation
const { MockWorkerClient } = vi.hoisted(() => {
  return {
    MockWorkerClient: vi.fn(function() {
      return {
        init: vi.fn().mockResolvedValue(undefined),
        sendMessage: vi.fn().mockResolvedValue([]),
        terminate: vi.fn().mockResolvedValue(undefined),
      };
    })
  };
});

// Mock dependencies
vi.mock('../../src/core/repositories/media-repository');
vi.mock('../../src/core/media-source');
vi.mock('../../src/core/worker-factory', () => ({
  WorkerFactory: {
    getWorkerPath: vi.fn().mockResolvedValue({ path: '/mock/worker.js', options: {} }),
  },
}));

vi.mock('../../src/core/worker-client', () => ({
  WorkerClient: MockWorkerClient
}));

// Mock fs/promises
vi.mock('fs/promises', async () => {
    return {
        default: {
            stat: vi.fn().mockResolvedValue({
                size: 1000,
                birthtime: new Date(),
                mtime: new Date()
            }),
            access: vi.fn().mockResolvedValue(undefined),
        }
    }
});


describe('Coverage Boost - MediaHandler', () => {
    let handler: MediaHandler;
    let req: any;
    let res: any;

    beforeEach(() => {
        handler = new MediaHandler({ ffmpegPath: '/usr/bin/ffmpeg', cacheDir: '/tmp' });
        req = {
            query: {},
            headers: {},
            path: '/test.mp4',
            on: vi.fn(),
        };
        res = {
            status: vi.fn().mockReturnThis(),
            send: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
            set: vi.fn().mockReturnThis(),
            sendFile: vi.fn(),
            headersSent: false,
            end: vi.fn(),
        };
    });

    it('handleStreamRequest - handles Access Denied error', async () => {
        // Mock validateFileAccess to throw
        const validateSpy = vi.spyOn(await import('../../src/core/access-validator'), 'validateFileAccess');
        validateSpy.mockRejectedValueOnce(new Error('Access denied'));

        req.query.file = '/test.mp4';
        await handler.handleStreamRequest(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.send).toHaveBeenCalledWith('Access denied.');
    });

    it('handleStreamRequest - handles generic error', async () => {
        const validateSpy = vi.spyOn(await import('../../src/core/access-validator'), 'validateFileAccess');
        validateSpy.mockRejectedValueOnce(new Error('Random error'));

        req.query.file = '/test.mp4';
        await handler.handleStreamRequest(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.send).toHaveBeenCalledWith('Error initializing source');
    });

    it('serveRawStream - handles stream error', async () => {
        const mockSource = {
            getSize: vi.fn().mockResolvedValue(100),
            getMimeType: vi.fn().mockResolvedValue('video/mp4'),
            getStream: vi.fn().mockResolvedValue({
                stream: new EventEmitter(), // Mock stream
                length: 100
            }),
            getFFmpegInput: vi.fn(),
        };

        // Inject pipe mock
        (mockSource.getStream as any).mockResolvedValue({
            stream: {
                pipe: vi.fn(),
                on: function(event: string, cb: any) {
                    if (event === 'error') cb(new Error('Stream failed'));
                },
                destroy: vi.fn(),
            },
            length: 100
        });

        // We need to bypass the private method protection or export serveRawStream
        // Fortunately serveRawStream is exported
        const { serveRawStream } = await import('../../src/core/media-handler');

        await serveRawStream(req, res, mockSource as any);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.end).toHaveBeenCalled();
    });
});

describe('Coverage Boost - MediaService', () => {
    let service: MediaService;
    let repoMock: any;

    beforeEach(() => {
        repoMock = new MediaRepository();
        service = new MediaService(repoMock);
        // Reset MockWorkerClient
        MockWorkerClient.mockClear();
    });

    it('scanDiskForAlbumsAndCache - handles getSetting error gracefully', async () => {
        repoMock.getMediaDirectories.mockResolvedValue([{ path: '/data', isActive: true }]);
        repoMock.getSetting.mockRejectedValue(new Error('DB Error'));

        // It should not throw, just log warn and proceed
        await expect(service.scanDiskForAlbumsAndCache()).resolves.toEqual([]);
    });

    it('scanDiskForAlbumsAndCache - handles getCachedAlbums error gracefully', async () => {
        repoMock.getMediaDirectories.mockResolvedValue([{ path: '/data', isActive: true }]);
        repoMock.getSetting.mockResolvedValue(null);
        repoMock.getCachedAlbums.mockRejectedValue(new Error('Cache Error'));

        await expect(service.scanDiskForAlbumsAndCache()).resolves.toEqual([]);
    });
});
