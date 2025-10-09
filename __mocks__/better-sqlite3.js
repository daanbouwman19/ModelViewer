/**
 * @file Manual mock for the `better-sqlite3` module.
 * This mock prevents the need for the native C++ addon during Jest tests.
 * It simulates the database behavior in memory, providing a fast and reliable
 * way to test database logic without touching the file system.
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

/**
 * In-memory data store for the mock database.
 * This object simulates the database tables.
 * @type {{media_views: {[hash: string]: MockMediaView}, app_cache: {[key: string]: MockAppCache}}}
 */
let mockDbStore = {};

/**
 * The core mock of the `better-sqlite3` constructor.
 * When `new Database()` is called in the code under test, Jest will use
 * this mock implementation instead of the actual module.
 * @returns {object} A mock database instance with methods like `prepare`, `transaction`, and `close`.
 */
const mockDatabase = jest.fn().mockImplementation(() => {
  const instance = {
    open: true,
    exec: jest.fn(),
    /**
     * Mocks the `prepare` method, which is used to create SQL statements.
     * It inspects the SQL string to return a mock statement object
     * with the appropriate `run`, `all`, or `get` method for that query.
     * @param {string} sql - The SQL query string.
     * @returns {object} A mock statement object.
     */
    prepare: jest.fn((sql) => {
      const statement = {
        run: jest.fn(),
        all: jest.fn(() => []),
        get: jest.fn(),
      };

      // --- Simulate SQL behavior based on the query string ---

      if (sql.includes('INSERT OR IGNORE INTO media_views')) {
        statement.run = (hash, path, date) => {
          if (!mockDbStore.media_views[hash]) {
            mockDbStore.media_views[hash] = { path, view_count: 0, last_viewed: date };
          }
        };
      } else if (sql.includes('UPDATE media_views')) {
        statement.run = (date, hash) => {
          if (mockDbStore.media_views[hash]) {
            mockDbStore.media_views[hash].view_count++;
            mockDbStore.media_views[hash].last_viewed = date;
          }
        };
      } else if (sql.includes('SELECT file_path_hash, view_count FROM media_views')) {
        statement.all = (hashes) =>
          hashes
            .map((h) => ({
              file_path_hash: h,
              view_count: mockDbStore.media_views[h] ? mockDbStore.media_views[h].view_count : 0,
            }))
            .filter((r) => mockDbStore.media_views[r.file_path_hash] !== undefined);
      } else if (sql.includes('INSERT OR REPLACE INTO app_cache')) {
        statement.run = (key, value, date) => {
          mockDbStore.app_cache[key] = { cache_value: value, last_updated: date };
        };
      } else if (sql.includes('SELECT cache_value FROM app_cache')) {
        statement.get = (key) => mockDbStore.app_cache[key];
      } else if (sql.includes('SELECT name FROM sqlite_master')) {
        // Mock the table check from initDatabase
        statement.all = () => [{ name: 'media_views' }, { name: 'app_cache' }];
      }

      return statement;
    }),
    /** Mocks the `transaction` method by simply executing the function passed to it. */
    transaction: jest.fn((fn) => fn()),
    /** Mocks the `close` method and updates the `open` status. */
    close: jest.fn(() => {
      instance.open = false;
    }),
  };
  return instance;
});

/**
 * A helper function attached to the mock constructor itself.
 * This allows tests to reset the in-memory `mockDbStore` before each run,
 * ensuring test isolation.
 */
mockDatabase.__resetStore = () => {
  mockDbStore = {
    media_views: {},
    app_cache: {},
  };
};

module.exports = mockDatabase;