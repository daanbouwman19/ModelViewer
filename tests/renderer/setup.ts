import { vi } from 'vitest';

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

vi.stubGlobal('localStorage', localStorageMock);

// Centralize RAF stubs for tests
let rafDepth = 0;
vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
  if (rafDepth > 5) {
    return setTimeout(() => cb(Date.now()), 0);
  }
  rafDepth++;
  try {
    cb(Date.now());
  } finally {
    rafDepth--;
  }
  return 1;
});
vi.stubGlobal('cancelAnimationFrame', () => {});
