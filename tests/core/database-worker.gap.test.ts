import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as dbWorker from '../../src/core/database-worker';

// --- Mocks Setup ---
const {
  mockDbInstance,
  mockStatement,
  mockDatabaseConstructor
} = vi.hoisted(() => {
  const mockStatement = {
    run: vi.fn(),
    all: vi.fn(() => []),
    get: vi.fn(),
  };

  const mockDbInstance = {
    pragma: vi.fn(),
    prepare: vi.fn(() => mockStatement),
    transaction: vi.fn((fn: any) => fn),
    close: vi.fn(),
  };

  const mockDatabaseConstructor = vi.fn();

  return {
    mockDbInstance,
    mockStatement,
    mockDatabaseConstructor
  };
});

// We need to return the function directly as default, not an object with default
vi.mock('better-sqlite3', () => {
  return {
    default: mockDatabaseConstructor
  };
});

vi.mock('worker_threads', () => {
    const parentPort = { on: vi.fn(), postMessage: vi.fn() };
    return {
        parentPort,
        default: { parentPort },
        __esModule: true
    };
});

vi.mock('fs/promises', () => ({
    default: { stat: vi.fn() },
    stat: vi.fn()
}));

describe('Database Worker Final Gap Fill', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDatabaseConstructor.mockImplementation(() => mockDbInstance);
        mockDbInstance.prepare.mockReturnValue(mockStatement);
        mockStatement.run.mockReset();
        mockStatement.all.mockReturnValue([]);
        mockStatement.get.mockReturnValue(undefined);
        // Force reset db internal state by closing first if needed
        mockStatement.all.mockClear();
        mockStatement.run.mockClear();
        mockStatement.get.mockClear();

        // Ensure mockDbInstance methods are cleared too if spies were attached
        vi.clearAllMocks();

        // Re-apply implementation because clearAllMocks wipes it?
        // No, beforeEach already does clearAllMocks at start.
        // But we need to ensure closeDatabase clears the internal 'db' variable in the module.
        // The real closeDatabase sets db = null.

        // Mock DB constructor again for this test run
        mockDatabaseConstructor.mockImplementation(function() { return mockDbInstance; });

        try { dbWorker.closeDatabase(); } catch {}
        dbWorker.initDatabase(':memory:');
    });

    afterEach(() => {
        dbWorker.closeDatabase();
    });

    it('filterProcessingNeeded: handles empty list', async () => {
        const result = await dbWorker.filterProcessingNeeded([]);
        expect(result.success).toBe(true);
        expect(result.data).toEqual([]);
    });

    it('filterProcessingNeeded: handles database result correctly', async () => {
        // Mock successful paths in DB
        mockStatement.all.mockReturnValue([{ file_path: '/success.mp4' }]);

        const paths = ['/success.mp4', '/new.mp4'];
        const result = await dbWorker.filterProcessingNeeded(paths);

        expect(result.success).toBe(true);
        expect(result.data).toEqual(['/new.mp4']);
    });

    it('executeSmartPlaylist: handles complex criteria', () => {
        const criteria = JSON.stringify({
            minRating: 3,
            minDuration: 60,
            minViews: 5,
            maxViews: 10,
            minDaysSinceView: 7
        });

        dbWorker.executeSmartPlaylist(criteria);

        expect(mockStatement.all).toHaveBeenCalled();
    });

    it('executeSmartPlaylist: handles invalid JSON criteria', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            dbWorker.executeSmartPlaylist('{invalid');
        } catch (e) {
            // ignore
        }
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });

    it('getMediaViewCounts: handles empty list', async () => {
        const result = await dbWorker.getMediaViewCounts([]);
        expect(result.success).toBe(true);
        expect(result.data).toEqual({});
    });

    it('getMediaViewCounts: fills missing paths with 0', async () => {
        // DB returns nothing
        mockStatement.all.mockReturnValue([]);

        const result = await dbWorker.getMediaViewCounts(['/missing.mp4']);
        expect(result.success).toBe(true);
        expect((result.data as any)['/missing.mp4']).toBe(0);
    });
});
