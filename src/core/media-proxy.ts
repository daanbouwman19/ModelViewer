import http from 'http';
import rangeParser from 'range-parser';
import { AddressInfo } from 'net';
import { getDriveFileMetadata } from '../main/google-drive-service';
import { getDriveStreamWithCache } from './drive-stream';

export class InternalMediaProxy {
  private static instance: InternalMediaProxy;
  private server: http.Server;
  private port: number = 0;
  private isListening: boolean = false;

  private constructor() {
    this.server = http.createServer(async (req, res) => {
      try {
        // Expected URL: /stream/:fileId
        const url = req.url || '';
        const match = url.match(/^\/stream\/([^/?]+)/);

        if (!match) {
          res.writeHead(404);
          res.end('Not Found');
          return;
        }

        const fileId = match[1];
        const meta = await getDriveFileMetadata(fileId);
        const totalSize = Number(meta.size);
        const mimeType = meta.mimeType || 'application/octet-stream';

        // Handle Range requests
        const rangeHeader = req.headers.range;

        let start = 0;
        let end = totalSize - 1;

        if (rangeHeader) {
          const ranges = rangeParser(totalSize, rangeHeader);

          if (Array.isArray(ranges) && ranges.length > 0) {
            start = ranges[0].start;
            end = ranges[0].end;
          } else if (ranges === -1) {
            res.writeHead(416, { 'Content-Range': `bytes */${totalSize}` });
            return res.end('Requested range not satisfiable.');
          }
        }

        const { stream, length } = await getDriveStreamWithCache(fileId, {
          start,
          end,
        });

        // Calculate the actual end byte being served based on the length returned
        const actualEnd = start + length - 1;

        res.writeHead(206, {
          'Content-Type': mimeType,
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes ${start}-${actualEnd}/${totalSize}`,
          'Content-Length': length,
        });

        stream.pipe(res);

        stream.on('error', (err: unknown) => {
          console.error('[InternalProxy] Stream Error:', err);
          if (!res.headersSent) {
            res.writeHead(500);
            res.end();
          }
        });

        req.on('close', () => {
          stream.destroy();
        });
      } catch (err) {
        console.error('[InternalProxy] Request Error:', err);
        if (!res.headersSent) {
          res.writeHead(500);
          res.end();
        }
      }
    });
  }

  public static getInstance(): InternalMediaProxy {
    if (!InternalMediaProxy.instance) {
      InternalMediaProxy.instance = new InternalMediaProxy();
    }
    return InternalMediaProxy.instance;
  }

  public async start(): Promise<void> {
    if (this.isListening) return;

    return new Promise((resolve, reject) => {
      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server.address() as AddressInfo;
        this.port = addr.port;
        this.isListening = true;
        console.log(`[InternalMediaProxy] Started on port ${this.port}`);
        resolve();
      });

      this.server.on('error', (err) => {
        reject(err);
      });
    });
  }

  public getUrlForFile(fileId: string): Promise<string> {
    if (!this.isListening) {
      // Lazy start
      return this.start().then(() => {
        return `http://127.0.0.1:${this.port}/stream/${fileId}`;
      });
    }
    return Promise.resolve(`http://127.0.0.1:${this.port}/stream/${fileId}`);
  }

  public getPort(): number {
    return this.port;
  }
}
