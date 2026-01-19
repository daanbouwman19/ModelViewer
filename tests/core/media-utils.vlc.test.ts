import { describe, it, expect, vi, afterEach } from 'vitest';
import { getVlcPath } from '../../src/core/media-utils';
import fs from 'fs';

// Mock fs.promises.access
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      promises: {
        ...actual.promises,
        access: vi.fn(),
      },
    },
  };
});

describe('getVlcPath', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
    vi.clearAllMocks();
  });

  it('should return null on Windows if VLC is not found', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'win32',
    });
    vi.mocked(fs.promises.access).mockRejectedValue(new Error('Not found'));

    const result = await getVlcPath();
    expect(result).toBeNull();
  });

  it('should return the path on Windows if VLC is found in the first location', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'win32',
    });
    vi.mocked(fs.promises.access).mockImplementation((path: any) => {
      if (path === 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe')
        return Promise.resolve();
      return Promise.reject(new Error('Not found'));
    });

    const result = await getVlcPath();
    expect(result).toBe('C:\\Program Files\\VideoLAN\\VLC\\vlc.exe');
  });

  it('should return the path on Windows if VLC is found in the second location', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'win32',
    });
    vi.mocked(fs.promises.access).mockImplementation((path: any) => {
      if (path === 'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe')
        return Promise.resolve();
      return Promise.reject(new Error('Not found'));
    });

    const result = await getVlcPath();
    expect(result).toBe('C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe');
  });

  it('should return Mac path if found on Darwin', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
    });
    vi.mocked(fs.promises.access).mockResolvedValue(undefined);

    const result = await getVlcPath();
    expect(result).toBe('/Applications/VLC.app/Contents/MacOS/VLC');
  });

  it('should return "vlc" if not found on Darwin', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
    });
    vi.mocked(fs.promises.access).mockRejectedValue(new Error('Not found'));

    const result = await getVlcPath();
    expect(result).toBe('vlc');
  });

  it('should return specific path on Linux if found', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'linux',
    });
    vi.mocked(fs.promises.access).mockImplementation((path: any) => {
      if (path === '/usr/bin/vlc') return Promise.resolve();
      return Promise.reject(new Error('Not found'));
    });

    const result = await getVlcPath();
    expect(result).toBe('/usr/bin/vlc');
  });

  it('should return "vlc" if not found on Linux', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'linux',
    });
    vi.mocked(fs.promises.access).mockRejectedValue(new Error('Not found'));

    const result = await getVlcPath();
    expect(result).toBe('vlc');
  });

  it('should return "vlc" on unknown platform', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'sunos',
    });

    const result = await getVlcPath();
    expect(result).toBe('vlc');
  });
});
