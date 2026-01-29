import { vi } from 'vitest';

/**
 * Global setup for renderer tests.
 * This file is executed before each test file in the renderer suite.
 */

// Mock localStorage
const localStorageMock = (function () {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
    get length() {
      return Object.keys(store).length;
    },
  };
})();

// Centralize RAF stubs for tests
let rafDepth = 0;
const rafStub = (cb: FrameRequestCallback) => {
  if (rafDepth > 10) {
    // Prevent infinite recursion in animation loops while still allowing tests to finish
    return setTimeout(() => {
      cb(Date.now());
    }, 0);
  }
  rafDepth++;
  try {
    cb(Date.now());
  } finally {
    rafDepth--;
  }
  return 1;
};

const cafStub = (id: any) => {
  clearTimeout(id as any);
};

// Use multiple methods to ensure visibility in all test environments (Node, Happy-DOM, etc.)
// We assign to globalThis, global, and window if they exist.
const targets = [
  globalThis,
  typeof global !== 'undefined' ? global : null,
  typeof window !== 'undefined' ? window : null,
].filter((t): t is any => t !== null);

targets.forEach((target) => {
  Object.defineProperty(target, 'requestAnimationFrame', {
    value: rafStub,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(target, 'cancelAnimationFrame', {
    value: cafStub,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(target, 'localStorage', {
    value: localStorageMock,
    writable: true,
    configurable: true,
  });
});

// Also use Vitest's stubGlobal for integrated mocking support
try {
  vi.stubGlobal('requestAnimationFrame', rafStub);
  vi.stubGlobal('cancelAnimationFrame', cafStub);
  vi.stubGlobal('localStorage', localStorageMock);
} catch {
  // Ignore error if vi.stubGlobal is not available
}

// Export for use in tests if needed (though they are global)
export { localStorageMock, rafStub, cafStub };
