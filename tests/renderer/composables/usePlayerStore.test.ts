import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePlayerStore } from '@/composables/usePlayerStore';

describe('usePlayerStore', () => {
  let store: ReturnType<typeof usePlayerStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = usePlayerStore();
    store.resetPlayerState();
    store.stopSlideshow();
  });

  it('should initialize with default values', () => {
    expect(store.isSlideshowActive.value).toBe(false);
    expect(store.displayedMediaFiles.value).toEqual([]);
    expect(store.currentMediaIndex.value).toBe(-1);
  });

  it('should reset player state', () => {
    store.isSlideshowActive.value = true;
    store.displayedMediaFiles.value = [{ path: 'test' } as any];
    store.currentMediaIndex.value = 0;
    store.currentMediaItem.value = { path: 'test' } as any;

    store.resetPlayerState();

    expect(store.isSlideshowActive.value).toBe(false);
    expect(store.displayedMediaFiles.value).toEqual([]);
    expect(store.currentMediaIndex.value).toBe(-1);
    expect(store.currentMediaItem.value).toBe(null);
  });

  it('should stop slideshow and clear timer', () => {
    vi.useFakeTimers();
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

    // Simulate active timer
    store.slideshowTimerId.value = setInterval(() => {}, 1000) as any;
    store.isTimerRunning.value = true;

    store.stopSlideshow();

    expect(clearIntervalSpy).toHaveBeenCalled();
    expect(store.slideshowTimerId.value).toBe(null);
    expect(store.isTimerRunning.value).toBe(false);

    vi.useRealTimers();
  });
});
