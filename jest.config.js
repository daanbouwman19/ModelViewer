/**
 * @file Configuration for the Jest testing framework.
 * This file specifies the environment, test file patterns, and other
 * settings for running automated tests.
 */
module.exports = {
  /**
   * Specifies the test environment that will be used for testing.
   * 'node' is appropriate for testing a Node.js-based application like Electron's main process.
   * @type {string}
   */
  testEnvironment: 'node',

  /**
   * An array of glob patterns that Jest uses to detect test files.
   * This pattern tells Jest to look for any file ending in `.test.js`
   * inside any subdirectory of the `tests` directory.
   * @type {string[]}
   */
  testMatch: ['**/tests/**/*.test.js'],

  /**
   * The default timeout for a single test in milliseconds.
   * Increased to 10 seconds to allow for potentially longer-running
   * asynchronous operations like file I/O or database interactions during tests.
   * @type {number}
   */
  testTimeout: 10000, // Increase timeout to 10 seconds

  /**
   * A map from regular expressions to paths to transformers.
   * This tells Jest to use babel-jest to transform JavaScript files.
   * @type {Object<string, string>}
   */
  transform: {
    '^.+\\.js$': 'babel-jest',
  },

};
