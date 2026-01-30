import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import MediaGridItem from '../../../src/renderer/components/MediaGridItem.vue';

// Mock formatDurationForA11y to return predictable strings
vi.mock('../../../src/renderer/utils/timeUtils', async () => {
  const actual = await vi.importActual('../../../src/renderer/utils/timeUtils');
  return {
    ...(actual as any),
    formatDurationForA11y: (s: number) => `${s} sec`,
  };
});

describe('MediaGridItem.vue', () => {
  const defaultProps = {
    imageExtensionsSet: new Set(['.jpg']),
    videoExtensionsSet: new Set(['.mp4']),
    mediaUrlGenerator: (path: string) => path,
    thumbnailUrlGenerator: (path: string) => path,
    failedImagePaths: new Set<string>(),
  };

  it('renders correct aria-label for image without rating', () => {
    const item = {
      path: 'test.jpg',
      name: 'test.jpg',
      rating: 0,
      duration: 0,
    };
    const wrapper = mount(MediaGridItem, {
      props: {
        ...defaultProps,
        item,
      },
    });

    const button = wrapper.find('button');
    expect(button.attributes('aria-label')).toBe('View test.jpg, Image');
  });

  it('renders correct aria-label for single star rating', () => {
    const item = {
      path: 'test.jpg',
      name: 'test.jpg',
      rating: 1,
      duration: 0,
    };
    const wrapper = mount(MediaGridItem, {
      props: {
        ...defaultProps,
        item,
      },
    });

    const button = wrapper.find('button');
    expect(button.attributes('aria-label')).toBe('View test.jpg, Image, Rated 1 star');
  });

  it('renders correct aria-label for image with rating', () => {
    const item = {
      path: 'test.jpg',
      name: 'test.jpg',
      rating: 4,
      duration: 0,
    };
    const wrapper = mount(MediaGridItem, {
      props: {
        ...defaultProps,
        item,
      },
    });

    const button = wrapper.find('button');
    expect(button.attributes('aria-label')).toBe(
      'View test.jpg, Image, Rated 4 stars',
    );
  });

  it('renders correct aria-label for video without rating', () => {
    const item = {
      path: 'test.mp4',
      name: 'test.mp4',
      rating: 0,
      duration: 120,
    };
    const wrapper = mount(MediaGridItem, {
      props: {
        ...defaultProps,
        item,
      },
    });

    const button = wrapper.find('button');
    expect(button.attributes('aria-label')).toBe(
      'View test.mp4, Video, 120 sec',
    );
  });

  it('renders correct aria-label for video with rating', () => {
    const item = {
      path: 'test.mp4',
      name: 'test.mp4',
      rating: 5,
      duration: 120,
    };
    const wrapper = mount(MediaGridItem, {
      props: {
        ...defaultProps,
        item,
      },
    });

    const button = wrapper.find('button');
    expect(button.attributes('aria-label')).toBe(
      'View test.mp4, Video, 120 sec, Rated 5 stars',
    );
  });
});
