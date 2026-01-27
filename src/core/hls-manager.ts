import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { getHlsTranscodeArgs } from './utils/ffmpeg-utils.ts';
import { HLS_SEGMENT_DURATION } from './constants.ts';
import ffmpegStatic from 'ffmpeg-static';

interface HlsSession {
  process: ChildProcess;
  lastAccess: number;
  outputDir: string;
  playlistPath: string;
}

const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes inactivity timeout

export class HlsManager {
  private static instance: HlsManager;
  private sessions: Map<string, HlsSession> = new Map();
  private cacheDir: string | null = null;

  private constructor() {
    // Cleanup interval
    setInterval(() => this.cleanup(), 60 * 1000);
  }

  static getInstance(): HlsManager {
    if (!HlsManager.instance) {
      HlsManager.instance = new HlsManager();
    }
    return HlsManager.instance;
  }

  setCacheDir(dir: string) {
    this.cacheDir = dir;
  }

  async ensureSession(sessionId: string, filePath: string): Promise<void> {
    if (this.sessions.has(sessionId)) {
      this.sessions.get(sessionId)!.lastAccess = Date.now();
      return;
    }

    if (!this.cacheDir) {
      throw new Error('HLS Cache directory not set');
    }

    if (!ffmpegStatic) {
      throw new Error('FFmpeg not found');
    }

    const outputDir = path.join(this.cacheDir, sessionId);
    await fs.mkdir(outputDir, { recursive: true });

    const segmentPath = path.join(outputDir, 'segment_%03d.ts');
    const playlistPath = path.join(outputDir, 'playlist.m3u8');

    const args = getHlsTranscodeArgs(
      filePath,
      segmentPath,
      playlistPath,
      HLS_SEGMENT_DURATION,
    );

    // If starting from a specific time, add -ss before -i in getHlsTranscodeArgs??
    // Wait, getHlsTranscodeArgs currently puts -i inside it.
    // I need to update getHlsTranscodeArgs to support seeking if I want to support resume.
    // However, for HLS, we usually start from 0 and let the player seek?
    // Or we handle seeking by starting a NEW session from that timestamp?
    // For now, let's assume we start from 0. The player requests segments.
    // If the user seeks, the player might just request the corresponding segment if it exists in the playlist.
    // But if we transcode on demand, we make a VOD playlist.
    // Generating the WHOLE file as HLS takes time.
    // Usually on-the-fly HLS is tricky for seeking if you haven't generated segments yet.
    // Ffmpeg will generate segments as fast as it can.
    // For VOD, we usually let it run.

    // NOTE: For seeking far ahead, we might need to kill session and start a new one from offset?
    // hls.js usually handles VOD by reading the full playlist.
    // If we generate a full VOD playlist, ffmpeg needs to scan the whole file? passed '-hls_list_size 0'.
    // Yes.

    console.log(`[HLS] Starting session ${sessionId} for ${filePath}`);
    const proc = spawn(ffmpegStatic, args);

    // Handle errors
    proc.on('error', (err) => {
      console.error(`[HLS] Session ${sessionId} error:`, err);
      this.stopSession(sessionId);
    });

    proc.on('exit', (code, signal) => {
      if (code !== 0 && signal !== 'SIGKILL') {
        console.error(`[HLS] Session ${sessionId} exited with code ${code}`);
      }
      // Don't remove session immediately on exit, as we need to serve the files.
      // But we can mark it as finished or just let timeout handle it?
      // If process finishes, files are there. We keep the session entry to know dir exists.
      // But we can drop the process ref.
    });

    this.sessions.set(sessionId, {
      process: proc,
      lastAccess: Date.now(),
      outputDir,
      playlistPath,
    });

    // Wait for playlist to be created?
    await this.waitForPlaylist(sessionId, playlistPath);
  }

  private async waitForPlaylist(
    sessionId: string,
    playlistPath: string,
    retries = 20,
  ): Promise<void> {
    for (let i = 0; i < retries; i++) {
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error('Session disappeared during HLS initialization');
      }

      if (
        session.process.killed ||
        (session.process.exitCode !== null &&
          session.process.exitCode !== undefined)
      ) {
        throw new Error('HLS process exited before playlist creation');
      }

      try {
        await fs.access(playlistPath);
        return;
      } catch {
        // Wait 500ms
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    throw new Error('Timeout waiting for HLS playlist');
  }

  getSessionDir(sessionId: string): string | undefined {
    // SECURITY: This returns the outputDir which is constructed from sessionId.
    // sessionId should be sanitized or generated safely.
    return this.sessions.get(sessionId)?.outputDir;
  }

  touchSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (session) session.lastAccess = Date.now();
  }

  stopSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.process && !session.process.killed) {
      session.process.kill('SIGKILL');
    }

    // Clean up files
    fs.rm(session.outputDir, { recursive: true, force: true }).catch((err) =>
      console.error(`[HLS] Failed to clean up ${session.outputDir}:`, err),
    );

    this.sessions.delete(sessionId);
  }

  cleanup() {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (now - session.lastAccess > SESSION_TIMEOUT_MS) {
        console.log(`[HLS] Cleaning up inactive session ${id}`);
        this.stopSession(id);
      }
    }
  }
}
