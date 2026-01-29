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
const rafStub = (cb: FrameRequestCallback) => {
  if (rafDepth > 10) {
    // Prevent infinite recursion in animation loops while still allowing tests to finish
    return setTimeout(() => cb(Date.now()), 0);
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
  clearTimeout(id);
};

// Use multiple methods to ensure visibility in all test environments
(globalThis as any).requestAnimationFrame = rafStub;
(globalThis as any).cancelAnimationFrame = cafStub;

// Also attach to global/window if they exist to be doubly sure
if (typeof global !== 'undefined') {
  (global as any).requestAnimationFrame = rafStub;
  (global as any).cancelAnimationFrame = cafStub;
}
if (typeof window !== 'undefined') {
  (window as any).requestAnimationFrame = rafStub;
  (window as any).cancelAnimationFrame = cafStub;
}

try {
  vi.stubGlobal('requestAnimationFrame', rafStub);
  vi.stubGlobal('cancelAnimationFrame', cafStub);
} catch {
  // Ignore if vi is not available
}
