import { execa } from 'execa';

const FFMPEG_TRANSCODE_PRESET = 'ultrafast';
const FFMPEG_TRANSCODE_CRF = '23';

/**
 * Standard FFmpeg input options for probing and analysis.
 */
const FFMPEG_INPUT_OPTIONS = ['-analyzeduration', '100M', '-probesize', '100M'];

/**
 * Standard FFmpeg output options for transcoding to browser-compatible format (MP4/H.264).
 */
const FFMPEG_OUTPUT_OPTIONS = [
  '-f',
  'mp4',
  '-vcodec',
  'libx264',
  '-acodec',
  'aac',
  '-movflags',
  'frag_keyframe+empty_moov',
  '-preset',
  FFMPEG_TRANSCODE_PRESET,
  '-crf',
  FFMPEG_TRANSCODE_CRF,
  '-pix_fmt',
  'yuv420p',
  'pipe:1',
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
  const args: string[] = ['-hide_banner', '-loglevel', 'error'];

  if (startTime) {
    if (!isValidTimeFormat(startTime)) {
      throw new Error('Invalid start time format');
    }
    args.push('-ss', startTime);
  }

  args.push(...FFMPEG_INPUT_OPTIONS);
  args.push('-i', inputPath);
  args.push(...FFMPEG_OUTPUT_OPTIONS);

  return args;
}

export function getThumbnailArgs(
  filePath: string,
  cacheFile: string,
): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
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
    '-hide_banner',
    '-loglevel',
    'error',
    ...FFMPEG_INPUT_OPTIONS,
    '-i',
    inputPath,
    ...FFMPEG_OUTPUT_OPTIONS, // Re-use standard MP4 options (h264/aac)
    // Override some output options for HLS if needed, but the base ones set libx264/aac which is good.
    // However, -movflags frag_keyframe+empty_moov might not be needed for HLS as it segments TS files?
    // Actually, HLS usually uses MPEG-TS (-f hls uses .ts by default).
    // The FFMPEG_OUTPUT_OPTIONS uses -f mp4. We need to override that.
    // Let's manually construct args instead of reusing FFMPEG_OUTPUT_OPTIONS entirely effectively.
    // Re-declaring key video/audio codecs:
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
