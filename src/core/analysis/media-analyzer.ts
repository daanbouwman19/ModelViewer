import { spawn } from 'child_process';
import ffmpegStatic from 'ffmpeg-static';
import { getFFmpegStreams } from '../utils/ffmpeg-utils';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export interface HeatmapData {
  audio: number[];
  motion: number[];
  points: number;
}

const DEFAULT_HEATMAP_POINTS = 100;
const MIN_HEATMAP_POINTS = 1;
const MAX_HEATMAP_POINTS = 1000;
const ANALYZER_TIMEOUT_MS = 2 * 60 * 1000;

export class MediaAnalyzer {
  private static instance: MediaAnalyzer;
  private cacheDir: string | null = null;

  private constructor() {}

  static getInstance(): MediaAnalyzer {
    if (!MediaAnalyzer.instance) {
      MediaAnalyzer.instance = new MediaAnalyzer();
    }
    return MediaAnalyzer.instance;
  }

  setCacheDir(dir: string) {
    this.cacheDir = dir;
  }

  private getCachePath(filePath: string, points: number): string | null {
    if (!this.cacheDir) return null;
    const hash = crypto
      .createHash('sha256')
      .update(filePath + points)
      .digest('hex');
    return path.join(this.cacheDir, `heatmap_${hash}.json`);
  }

  private activeJobs: Map<
    string,
    { promise: Promise<HeatmapData>; progress: number }
  > = new Map();

  getProgress(filePath: string): number | null {
    const job = this.activeJobs.get(filePath);
    return job ? job.progress : null;
  }

  async generateHeatmap(
    filePath: string,
    points: number = DEFAULT_HEATMAP_POINTS,
  ): Promise<HeatmapData> {
    const safePoints = this.sanitizePoints(points);
    if (!ffmpegStatic) {
      throw new Error('FFmpeg not found');
    }

    // Check duplicate jobs
    const existingJob = this.activeJobs.get(filePath);
    if (existingJob) {
      console.log(`[MediaAnalyzer] Joining existing job for ${filePath}`);
      return existingJob.promise;
    }

    console.log(
      `[MediaAnalyzer] Generating heatmap for ${filePath} with ${safePoints} points`,
    );

    // Create job promise early to register it before any async operations
    // This prevents race conditions where two concurrent calls both pass the duplicate check
    const jobPromise = new Promise<HeatmapData>(async (resolve, reject) => {
      try {
        // Check cache
        const cachePath = this.getCachePath(filePath, safePoints);
        if (cachePath) {
          try {
            const cached = await fs.readFile(cachePath, 'utf-8');
            resolve(JSON.parse(cached));
            return;
          } catch {
            // Cache miss, continue with FFmpeg
          }
        }

        // Check for streams
        const { hasVideo, hasAudio } = await getFFmpegStreams(
          filePath,
          ffmpegStatic!,
        );

        if (!hasVideo && !hasAudio) {
          throw new Error('No video or audio streams found');
        }

        const inputs = ['-i', filePath];
        const filterChains: string[] = [];
        const mapArgs: string[] = [];

        // Dynamic Filter Chain Construction
        const videoAnalysisFilter = `[0:v]fps=1,signalstats,metadata=print:key=lavfi.signalstats.YDIF:file=-[v]`;
        const audioAnalysisFilter = `[0:a]asetnsamples=22050,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-[a]`;

        if (hasVideo) {
          filterChains.push(videoAnalysisFilter);
          mapArgs.push('-map', '[v]');
        }

        if (hasAudio) {
          filterChains.push(audioAnalysisFilter);
          mapArgs.push('-map', '[a]');
        }

        const args = [
          ...inputs,
          '-filter_complex',
          filterChains.join(';'),
          ...mapArgs,
          '-f',
          'null',
          '-',
        ];

        const process = spawn(ffmpegStatic!, args, {
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        const timeoutTimer = setTimeout(() => {
          console.warn(`[MediaAnalyzer] Process timed out for ${filePath}`);
          process.kill('SIGKILL');
          reject(new Error('Heatmap generation timed out'));
        }, ANALYZER_TIMEOUT_MS);

        let output = '';
        let errorOutput = '';
        let durationSec = 0;

        process.stdout.on('data', (data) => {
          output += data.toString();
        });

        process.stderr.on('data', (data) => {
          const str = data.toString();
          errorOutput += str;

          // Parse Duration if not yet found
          if (!durationSec) {
            const durMatch = str.match(/Duration: (\d+):(\d+):(\d+)\.(\d+)/);
            if (durMatch) {
              const h = parseInt(durMatch[1], 10);
              const m = parseInt(durMatch[2], 10);
              const s = parseInt(durMatch[3], 10);
              durationSec = h * 3600 + m * 60 + s;
            }
          }

          // Parse Progress
          if (durationSec > 0) {
            const timeMatch = str.match(/time=(\d+):(\d+):(\d+)\.(\d+)/);
            if (timeMatch) {
              const h = parseInt(timeMatch[1], 10);
              const m = parseInt(timeMatch[2], 10);
              const s = parseInt(timeMatch[3], 10);
              const currentSec = h * 3600 + m * 60 + s;
              const progress = Math.min(
                100,
                Math.round((currentSec / durationSec) * 100),
              );

              // Update progress in map
              const job = this.activeJobs.get(filePath);
              if (job) {
                job.progress = progress;
              }
            }
          }
        });

        process.on('error', (err) => {
          console.error('[MediaAnalyzer] Failed to start ffmpeg process:', err);
          reject(err);
        });

        process.on('close', async (code) => {
          clearTimeout(timeoutTimer);
          if (code !== 0) {
            console.error(`[MediaAnalyzer] FFmpeg exited with code ${code}`);
            console.error(
              `[MediaAnalyzer] Stderr: ${errorOutput.slice(-1000)}`,
            );
            reject(new Error(`FFmpeg process exited with code ${code}`));
            return;
          }

          if (errorOutput.includes('Error')) {
            console.warn(
              `[MediaAnalyzer] FFmpeg succeeded but reported errors: ${errorOutput.slice(-500)}`,
            );
          }

          try {
            const motionValues: number[] = [];
            const audioValues: number[] = [];

            const lines = output.split('\n');
            for (const line of lines) {
              if (line.includes('lavfi.signalstats.YDIF')) {
                const val = parseFloat(line.split('=')[1]);
                if (!isNaN(val)) motionValues.push(val);
              } else if (line.includes('lavfi.astats.Overall.RMS_level')) {
                const val = parseFloat(line.split('=')[1]);
                if (!isNaN(val)) audioValues.push(val);
              }
            }

            console.log(
              `[MediaAnalyzer] Parsed ${motionValues.length} motion samples and ${audioValues.length} audio samples.`,
            );

            // Downsample to `points`
            const resampledAudio = this.resample(audioValues, safePoints, -90);
            const resampledMotion = this.resample(motionValues, safePoints, 0);

            const result: HeatmapData = {
              audio: resampledAudio,
              motion: resampledMotion,
              points: safePoints,
            };

            // Cache result
            if (cachePath) {
              const dir = path.dirname(cachePath);
              try {
                await fs.mkdir(dir, { recursive: true });
                await fs.writeFile(cachePath, JSON.stringify(result));
              } catch (cacheErr) {
                console.warn('[MediaAnalyzer] Failed to write cache', cacheErr);
              }
            }

            resolve(result);
          } catch (e) {
            console.error('[MediaAnalyzer] Parse error:', e);
            reject(e);
          }
        });
      } catch (e) {
        reject(e);
      }
    });

    // Store in active jobs IMMEDIATELY to prevent race conditions
    this.activeJobs.set(filePath, { promise: jobPromise, progress: 0 });

    // Remove from active jobs when done
    jobPromise
      .finally(() => {
        this.activeJobs.delete(filePath);
      })
      .catch(() => {
        // Ignore rejection in this side-effect chain; it's handled by the returned promise
      });

    return jobPromise;
  }

  // Simple bucket average resampling
  private resample(
    data: number[],
    targetLength: number,
    defaultValue: number,
  ): number[] {
    const safeTargetLength = this.sanitizePoints(targetLength);
    if (data.length === 0) {
      return new Array(safeTargetLength).fill(defaultValue);
    }

    const result: number[] = [];
    const step = data.length / safeTargetLength;

    for (let i = 0; i < safeTargetLength; i++) {
      const start = Math.floor(i * step);
      const end = Math.floor((i + 1) * step);
      const slice = data.slice(start, end);

      // Note: When downsampling, slice will have 1 or more items.
      // When upsampling, slice can be empty.
      if (slice.length > 0) {
        const sum = slice.reduce((a, b) => a + b, 0);
        result.push(sum / slice.length);
      } else {
        // Updated Up-sampling Logic:
        // If slice is empty (start == end), we are zooming in on a single point.
        // Use data[start] if available, otherwise fallback.
        if (start < data.length) {
          result.push(data[start]);
        } else {
          // Should be unreachable with current math, but safe fallback to default
          result.push(defaultValue);
        }
      }
    }
    return result;
  }

  private sanitizePoints(points: number): number {
    if (!Number.isFinite(points)) return DEFAULT_HEATMAP_POINTS;
    const rounded = Math.floor(points);
    if (rounded < MIN_HEATMAP_POINTS) return MIN_HEATMAP_POINTS;
    return Math.min(MAX_HEATMAP_POINTS, rounded);
  }
}
