/**
 * @file Manual mock for the `better-sqlite3` module.
 * This mock prevents the need for the native C++ addon during Jest tests.
 * It simulates the database behavior in memory, providing a fast and reliable
 * way to test database logic without touching the file system.
 * It includes helpers to inject errors for testing failure scenarios.
 */

/**
 * @typedef {Object} MockMediaView
 * @property {string} path - The original file path.
 * @property {number} view_count - The number of times the media has been viewed.
 * @property {string} last_viewed - The ISO timestamp of the last view.
 */

/**
 * @typedef {Object} MockAppCache
 * @property {string} cache_value - The JSON stringified value of the cache item.
 * @property {string} last_updated - The ISO timestamp of the last update.
 */

let mockDbStore = {};
let nextQueryError = null;
let nextCloseError = null;
let nextConstructorError = null;
let nextExecError = null;

/**
 * The core mock of the `better-sqlite3` constructor.
 * When `new Database()` is called in the code under test, Jest will use
 * this mock implementation instead of the actual module.
 * @returns {object} A mock database instance with methods like `prepare`, `transaction`, and `close`.
 */
const mockDatabase = jest.fn().mockImplementation(() => {
  if (nextConstructorError) {
    const err = nextConstructorError;
    nextConstructorError = null;
    throw err;
  }

  const instance = {
    open: true,
    /** Mocks the `exec` method, used for schema creation. */
    exec: jest.fn(() => {
      if (nextExecError) {
        const err = nextExecError;
        nextExecError = null;
        throw err;
      }
    }),
    /**
     * Mocks the `prepare` method, which is used to create SQL statements.
     * It inspects the SQL string to return a mock statement object
     * with the appropriate `run`, `all`, or `get` method for that query.
     * @param {string} sql - The SQL query string.
     * @returns {object} A mock statement object.
     */
    prepare: jest.fn((sql) => {
      /**
       * Wraps a query function (e.g., run, all, get) to check for an injected error.
       * If `nextQueryError` is set, it will be thrown. Otherwise, the original function is called.
       * @param {Function} originalFn - The original query function to wrap.
       * @returns {Function}
       */
      const createQueryRunner =
        (originalFn) =>
        (...args) => {
          if (nextQueryError) {
            const err = nextQueryError;
            nextQueryError = null;
            throw err;
          }
          return originalFn(...args);
        };

      const statement = {
        run: jest.fn(),
        all: jest.fn(() => []),
        get: jest.fn(),
      };

      if (sql.includes('INSERT OR IGNORE INTO media_views')) {
        statement.run = createQueryRunner((hash, path, date) => {
          if (!mockDbStore.media_views[hash]) {
            mockDbStore.media_views[hash] = {
              path,
              view_count: 0,
              last_viewed: date,
            };
          }
        });
      } else if (sql.includes('UPDATE media_views')) {
        statement.run = createQueryRunner((date, hash) => {
          if (mockDbStore.media_views[hash]) {
            mockDbStore.media_views[hash].view_count++;
            mockDbStore.media_views[hash].last_viewed = date;
          }
        });
      } else if (
        sql.includes('SELECT file_path_hash, view_count FROM media_views')
      ) {
        statement.all = createQueryRunner((hashes) =>
          hashes
            .map((h) => ({
              file_path_hash: h,
              view_count: mockDbStore.media_views[h]
                ? mockDbStore.media_views[h].view_count
                : 0,
            }))
            .filter(
              (r) => mockDbStore.media_views[r.file_path_hash] !== undefined,
            ),
        );
      } else if (sql.includes('INSERT OR REPLACE INTO app_cache')) {
        statement.run = createQueryRunner((key, value, date) => {
          mockDbStore.app_cache[key] = {
            cache_value: value,
            last_updated: date,
          };
        });
      } else if (sql.includes('SELECT cache_value FROM app_cache')) {
        statement.get = createQueryRunner((key) => mockDbStore.app_cache[key]);
      } else if (sql.includes('SELECT name FROM sqlite_master')) {
        statement.all = createQueryRunner(() => [
          { name: 'media_views' },
          { name: 'app_cache' },
        ]);
      }

      return statement;
    }),
    /** Mocks the `transaction` method by simply executing the function passed to it. */
    transaction: jest.fn((fn) => fn()),
    /** Mocks the `close` method, updating the `open` status and checking for injected errors. */
    close: jest.fn(() => {
      if (nextCloseError) {
        const err = nextCloseError;
        nextCloseError = null;
        throw err;
      }
      instance.open = false;
    }),
  };
  return instance;
});

/** Injects an error to be thrown by the next query operation (run, all, get). */
mockDatabase.__setNextQueryError = (err) => {
  nextQueryError = err;
};

/** Injects an error to be thrown by the next `close()` call. */
mockDatabase.__setNextCloseError = (err) => {
  nextCloseError = err;
};

/** Injects an error to be thrown by the next `Database` constructor call. */
mockDatabase.__setNextConstructorError = (err) => {
  nextConstructorError = err;
};

/** Injects an error to be thrown by the next `exec()` call. */
mockDatabase.__setNextExecError = (err) => {
  nextExecError = err;
};

/**
 * A helper function attached to the mock constructor itself.
 * This allows tests to reset the in-memory `mockDbStore` and any pending errors
 * before each run, ensuring test isolation.
 */
mockDatabase.__resetStore = () => {
  mockDbStore = {
    media_views: {},
    app_cache: {},
  };
  nextQueryError = null;
  nextCloseError = null;
  nextConstructorError = null;
  nextExecError = null;
};

module.exports = mockDatabase;
