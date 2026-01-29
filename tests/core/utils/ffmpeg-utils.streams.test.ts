import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getFFmpegStreams } from '../../../src/core/utils/ffmpeg-utils';

const { mockExeca } = vi.hoisted(() => ({
  mockExeca: vi.fn(),
}));

vi.mock('execa', () => ({
  execa: mockExeca,
}));

describe('getFFmpegStreams', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true for both when both streams exist', async () => {
    mockExeca.mockResolvedValue({
      exitCode: 0,
      stderr: 'Stream #0:0(und): Video: h264\nStream #0:1(eng): Audio: aac',
    });
    const res = await getFFmpegStreams('file', 'ffmpeg');
    expect(res).toEqual({ hasVideo: true, hasAudio: true });
  });

  it('returns false for video if missing', async () => {
    mockExeca.mockResolvedValue({
      exitCode: 0,
      stderr: 'Stream #0:0(eng): Audio: aac',
    });
    const res = await getFFmpegStreams('file', 'ffmpeg');
    expect(res).toEqual({ hasVideo: false, hasAudio: true });
  });

  it('returns false for audio if missing', async () => {
    mockExeca.mockResolvedValue({
      exitCode: 0,
      stderr: 'Stream #0:0(und): Video: h264',
    });
    const res = await getFFmpegStreams('file', 'ffmpeg');
    expect(res).toEqual({ hasVideo: true, hasAudio: false });
  });

  it('handles garbage output', async () => {
    mockExeca.mockResolvedValue({
      exitCode: 1, // Error but runFFmpeg returns it anyway
      stderr: 'Not a video file',
    });
    const res = await getFFmpegStreams('file', 'ffmpeg');
    expect(res).toEqual({ hasVideo: false, hasAudio: false });
  });
});
