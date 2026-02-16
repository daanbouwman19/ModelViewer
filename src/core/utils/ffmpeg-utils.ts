import { execa } from 'execa';

const FFMPEG_TRANSCODE_PRESET = 'ultrafast';
const FFMPEG_TRANSCODE_CRF = '23';

/**
 * Standard FFmpeg input options for probing and analysis.
 */
const FFMPEG_INPUT_OPTIONS = ['-analyzeduration', '100M', '-probesize', '100M'];

/**
 * Common logging and banner options.
 */
const FFMPEG_COMMON_ARGS = ['-hide_banner', '-loglevel', 'error'];

/**
 * Standard base codec arguments for H.264/AAC transcoding.
 * Used for both direct streaming (MP4) and HLS.
 */
const FFMPEG_BASE_CODEC_ARGS = [
  '-c:v',
  'libx264',
  '-c:a',
  'aac',
  '-preset',
  FFMPEG_TRANSCODE_PRESET,
  '-crf',
  FFMPEG_TRANSCODE_CRF,
  '-pix_fmt',
  'yuv420p',
];

export function isValidTimeFormat(time: string): boolean {
  // Allow simple seconds (e.g., "10", "10.5") or timestamps (e.g., "00:00:10", "00:10.5")
  // [SECURITY] Strictly validate format to prevent ReDoS and invalid FFmpeg arguments.
  // Limit to at most 2 colons (HH:MM:SS format).
  return /^(?:\d+:){0,2}\d+(?:\.\d+)?$/.test(time);
}

export function getTranscodeArgs(
  inputPath: string,
  startTime: string | undefined | null,
): string[] {
  const args: string[] = [...FFMPEG_COMMON_ARGS];

  if (startTime) {
    if (!isValidTimeFormat(startTime)) {
      throw new Error('Invalid start time format');
    }
    args.push('-ss', startTime);
  }

  args.push(...FFMPEG_INPUT_OPTIONS);
  args.push('-i', inputPath);

  // Output options specific to MP4 streaming
  args.push('-f', 'mp4');
  args.push(...FFMPEG_BASE_CODEC_ARGS);
  args.push('-movflags', 'frag_keyframe+empty_moov');
  args.push('pipe:1');

  return args;
}

export function getThumbnailArgs(
  filePath: string,
  cacheFile: string,
): string[] {
  return [
    ...FFMPEG_COMMON_ARGS,
    '-y',
    '-ss',
    '1',
    '-i',
    filePath,
    '-frames:v',
    '1',
    '-q:v',
    '5',
    '-update',
    '1',
    cacheFile,
  ];
}

/**
 * Runs FFmpeg (or any command) with a timeout to prevent hanging processes (DoS).
 * Uses `execa` for robust process handling.
 *
 * @param command - The command to run (e.g. ffmpeg path).
 * @param args - Arguments for the command.
 * @param timeoutMs - Timeout in milliseconds (default: 30000).
 * @returns Promise resolving to { code, stderr }.
 * @throws Error if process fails or times out.
 */
export async function runFFmpeg(
  command: string,
  args: string[],
  timeoutMs = 30000,
): Promise<{ code: number | null; stderr: string }> {
  try {
    const result = await execa(command, args, {
      timeout: timeoutMs,
      reject: false, // We want to handle non-zero exit codes manually to match previous behavior
    });

    if (result.timedOut) {
      // [SECURITY] Process timed out, ensure it was killed.
      // Execa kills it automatically on timeout.
      throw new Error(`Process timed out after ${timeoutMs}ms`);
    }

    return { code: result.exitCode ?? null, stderr: result.stderr };
  } catch (error: unknown) {
    // If it's a timeout error thrown by execa (can happen if reject: true, or maybe version diff)
    if (typeof error === 'object' && error !== null && 'timedOut' in error) {
      throw new Error(`Process timed out after ${timeoutMs}ms`);
    }
    throw error;
  }
}

export function parseFFmpegDuration(stderr: string): number | null {
  const match = stderr.match(/Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (match) {
    const hours = parseFloat(match[1]);
    const minutes = parseFloat(match[2]);
    const seconds = parseFloat(match[3]);
    return hours * 3600 + minutes * 60 + seconds;
  }
  return null;
}

export async function getFFmpegDuration(
  filePath: string,
  ffmpegPath: string,
): Promise<number> {
  try {
    const { stderr } = await runFFmpeg(ffmpegPath, ['-i', filePath]);
    const duration = parseFFmpegDuration(stderr);
    if (duration !== null) {
      return duration;
    } else {
      throw new Error('Could not determine duration');
    }
  } catch (err) {
    if ((err as Error).message === 'Could not determine duration') throw err;
    console.error('[Metadata] FFmpeg spawn error:', err);
    throw new Error('FFmpeg execution failed');
  }
}

export async function getFFmpegStreams(
  filePath: string,
  ffmpegPath: string,
): Promise<{ hasVideo: boolean; hasAudio: boolean }> {
  const { stderr } = await runFFmpeg(ffmpegPath, ['-i', filePath]);
  // FFmpeg typically outputs stream info to stderr
  const hasVideo = /Stream #\d+:\d+(?:.*): Video:/.test(stderr);
  const hasAudio = /Stream #\d+:\d+(?:.*): Audio:/.test(stderr);
  return { hasVideo, hasAudio };
}

export function getHlsTranscodeArgs(
  inputPath: string,
  outputSegmentPath: string,
  outputPlaylistPath: string,
  segmentDuration: number,
): string[] {
  // -hls_time: Target segment duration
  // -hls_list_size 0: Keep all segments in playlist (VOD style) for now.
  // -hls_segment_filename: naming pattern for segments
  // -f hls: HLS format
  return [
    ...FFMPEG_COMMON_ARGS,
    ...FFMPEG_INPUT_OPTIONS,
    '-i',
    inputPath,
    // Base video/audio codecs for HLS output
    ...FFMPEG_BASE_CODEC_ARGS,
    '-g',
    '48', // GOP size. ~2 seconds at 24fps. helps seeking.
    '-sc_threshold',
    '0',
    '-f',
    'hls',
    '-hls_time',
    segmentDuration.toString(),
    '-hls_list_size',
    '0', // 0 = keep all segments
    '-hls_segment_filename',
    outputSegmentPath,
    outputPlaylistPath,
  ];
}
