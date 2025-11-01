/**
 * Mock for worker_threads module
 * Used in tests to avoid spawning real worker threads
 */

const EventEmitter = require('events');

// Store for mock data shared across worker instances
let mockStore = {
  mediaViews: {},
  appCache: {},
};

class MockWorker extends EventEmitter {
  constructor(filename, options) {
    super();
    this.filename = filename;
    this.terminated = false;
    
    // Simulate async worker initialization
    setImmediate(() => {
      if (!this.terminated) {
        this.emit('online');
      }
    });
  }

  postMessage(message) {
    if (this.terminated) {
      throw new Error('Worker has been terminated');
    }

    const { id, type, payload } = message;

    // Simulate async message processing
    setImmediate(() => {
      if (this.terminated) return;

      let result;

      try {
        switch (type) {
          case 'init':
            result = { success: true };
            break;

          case 'recordMediaView':
            if (!mockStore.mediaViews[payload.filePath]) {
              mockStore.mediaViews[payload.filePath] = {
                viewCount: 0,
                lastViewed: null,
              };
            }
            mockStore.mediaViews[payload.filePath].viewCount++;
            mockStore.mediaViews[payload.filePath].lastViewed = new Date().toISOString();
            result = { success: true };
            break;

          case 'getMediaViewCounts':
            const viewCountsMap = {};
            payload.filePaths.forEach((filePath) => {
              viewCountsMap[filePath] = mockStore.mediaViews[filePath]?.viewCount || 0;
            });
            result = { success: true, data: viewCountsMap };
            break;

          case 'cacheModels':
            mockStore.appCache[payload.cacheKey] = {
              value: payload.models,
              lastUpdated: new Date().toISOString(),
            };
            result = { success: true };
            break;

          case 'getCachedModels':
            const cached = mockStore.appCache[payload.cacheKey];
            result = { 
              success: true, 
              data: cached ? cached.value : null 
            };
            break;

          case 'close':
            result = { success: true };
            break;

          default:
            result = { success: false, error: `Unknown message type: ${type}` };
        }
      } catch (error) {
        result = { success: false, error: error.message };
      }

      this.emit('message', { id, result });
    });
  }

  async terminate() {
    this.terminated = true;
    this.removeAllListeners();
    setImmediate(() => {
      this.emit('exit', 0);
    });
    return Promise.resolve(0);
  }

  ref() {
    return this;
  }
  
  unref() {
    return this;
  }
}

// Static method to reset the mock store (useful for tests)
MockWorker.__resetStore = function() {
  mockStore = {
    mediaViews: {},
    appCache: {},
  };
};

// Static method to access the store (useful for test assertions)
MockWorker.__getStore = function() {
  return mockStore;
};

module.exports = {
  Worker: MockWorker,
  parentPort: null, // Not used in main process tests
  workerData: null, // Not used in main process tests
};
