/**
 * @file HLS streaming handlers.
 * Extracted from media-handler.ts to separate concerns.
 */

import { Request, Response } from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';

import { HlsManager } from './hls-manager.ts';
import { validateFileAccess } from './access-validator.ts';
import { getQueryParam } from './utils/http-utils.ts';

/**
 * Serves the HLS Master Playlist.
 */
export async function serveHlsMaster(
  req: Request,
  res: Response,
  filePath: string,
) {
  const access = await validateFileAccess(filePath);
  if (!access.success) {
    if (!res.headersSent) res.status(access.statusCode).send(access.error);
    return;
  }
  // We don't need to resolve realpath here as the file param in query should be usable?
  // Actually validateFileAccess returns authorizedPath.
  // We should preserve the original 'file' query param for the sub-requests to ensure consistency?
  // Or encode the authorized path?
  // Let's use the original query param 'file' to keep it simple, assuming it's what the client sent.
  // But we need to be careful.
  const fileQuery = getQueryParam(req.query, 'file');
  const encodedFile = encodeURIComponent(fileQuery || '');

  const bandwidth = 2000000;
  const resolution = '1280x720';

  res.set('Content-Type', 'application/vnd.apple.mpegurl');
  res.send(`#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${resolution}
playlist.m3u8?file=${encodedFile}`);
}

/**
 * Serves the HLS Variant Playlist.
 */
export async function serveHlsPlaylist(
  req: Request,
  res: Response,
  filePath: string,
) {
  const access = await validateFileAccess(filePath);
  if (!access.success) {
    if (!res.headersSent) res.status(access.statusCode).send(access.error);
    return;
  }
  const authorizedPath = access.path;
  const sessionId = crypto
    .createHash('md5')
    .update(authorizedPath)
    .digest('hex');

  try {
    const hlsManager = HlsManager.getInstance();
    await hlsManager.ensureSession(sessionId, authorizedPath);

    const sessionDir = hlsManager.getSessionDir(sessionId);
    if (!sessionDir) throw new Error('Session dir not found');

    const playlistPath = path.join(sessionDir, 'playlist.m3u8');
    let playlistContent = await fs.readFile(playlistPath, 'utf8');

    // Rewrite segment paths to include the file query param
    // The segments are named 'segment_000.ts'
    // We want 'segment_000.ts?file=...'
    const fileQuery = getQueryParam(req.query, 'file');
    const encodedFile = encodeURIComponent(fileQuery || '');

    // Simple regex replace
    // Use a more robust regex that handles potential variations in segment naming
    const segmentRegex = /(segment_\d+\.ts)/g;
    playlistContent = playlistContent.replace(
      segmentRegex,
      `$1?file=${encodedFile}`,
    );

    res.set('Content-Type', 'application/vnd.apple.mpegurl');
    res.send(playlistContent);

    // Keep session alive
    hlsManager.touchSession(sessionId);
  } catch (e) {
    console.error('[HLS] Playlist error:', e);
    res.status(500).send('HLS Generation failed');
  }
}

/**
 * Serves an HLS Segment.
 */
export async function serveHlsSegment(
  _req: Request,
  res: Response,
  filePath: string,
  segmentName: string,
) {
  const access = await validateFileAccess(filePath);
  if (!access.success) {
    if (!res.headersSent) res.status(access.statusCode).send(access.error);
    return;
  }
  const authorizedPath = access.path;
  const sessionId = crypto
    .createHash('md5')
    .update(authorizedPath)
    .digest('hex');

  const hlsManager = HlsManager.getInstance();
  const sessionDir = hlsManager.getSessionDir(sessionId);

  // If session doesn't exist, we can't serve segment.
  // The player should have requested playlist first which creates session.
  // If session timed out, we assume segment is gone.
  if (!sessionDir) {
    res.status(404).send('Segment not found (Session expired)');
    return;
  }

  const segmentPath = path.join(sessionDir, segmentName);

  // Security check: segmentName should be simple filename
  if (segmentName.includes('/') || segmentName.includes('\\')) {
    res.status(400).send('Invalid segment name');
    return;
  }

  try {
    // Check if file exists
    await fs.access(segmentPath);
    res.sendFile(segmentPath);
    hlsManager.touchSession(sessionId);
  } catch {
    res.status(404).send('Segment not found');
  }
}
