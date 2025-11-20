import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSlideshow } from '../../src/renderer/composables/useSlideshow';
import { useAppState } from '../../src/renderer/composables/useAppState';
import { collectTexturesRecursive } from '../../src/renderer/utils/albumUtils';

// Mock dependencies
vi.mock('../../src/renderer/utils/albumUtils', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    collectTexturesRecursive: vi.fn(),
  };
});

describe('Grid View Feature', () => {
  const { state, resetState } = useAppState();
  const slideshow = useSlideshow();

  beforeEach(() => {
    resetState();
    state.viewMode = 'player';
    state.gridMediaFiles = [];
    vi.clearAllMocks();
  });

  it('useAppState should have new grid properties', () => {
    expect(state.viewMode).toBe('player');
    expect(state.gridMediaFiles).toEqual([]);
  });

  it('openAlbumInGrid should switch to grid view and populate gridMediaFiles', () => {
    const mockAlbum = {
      name: 'Test Album',
      textures: [
        { path: '/path/to/img1.jpg', name: 'img1.jpg' },
        { path: '/path/to/img2.jpg', name: 'img2.jpg' },
      ],
      children: [],
    };

    // Mock collectTexturesRecursive to return specific files
    vi.mocked(collectTexturesRecursive).mockReturnValue(mockAlbum.textures);

    // Call function
    slideshow.openAlbumInGrid(mockAlbum);

    // Assertions
    expect(collectTexturesRecursive).toHaveBeenCalledWith(mockAlbum);
    expect(state.gridMediaFiles).toEqual(mockAlbum.textures);
    expect(state.viewMode).toBe('grid');
    expect(state.isSlideshowActive).toBe(false);
  });

  it('openAlbumInGrid should filter media files', () => {
    const mockAlbum = {
      name: 'Test Album',
      textures: [
        { path: '/path/to/img1.jpg', name: 'img1.jpg' },
        { path: '/path/to/video.mp4', name: 'video.mp4' },
        { path: '/path/to/text.txt', name: 'text.txt' }, // Invalid type
      ],
      children: [],
    };

    state.supportedExtensions = {
      images: ['.jpg'],
      videos: ['.mp4'],
      all: ['.jpg', '.mp4'],
    };

    state.mediaFilter = 'Images'; // Should only include images

    vi.mocked(collectTexturesRecursive).mockReturnValue(mockAlbum.textures);

    slideshow.openAlbumInGrid(mockAlbum);

    expect(state.gridMediaFiles.length).toBe(1);
    expect(state.gridMediaFiles[0].path).toBe('/path/to/img1.jpg');
  });
});
