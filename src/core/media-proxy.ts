import http from 'http';
import { AddressInfo } from 'net';

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
        // Use createMediaSource factory instead of direct class instantiation to decouple if desired,
        // or just use DriveMediaSource. But to avoid circular dependency, we import createMediaSource which is in media-source.ts.
        // Wait, media-source.ts imports media-proxy.ts. Circular dependency!
        // media-source.ts IMPORTS InternalMediaProxy.
        // media-proxy.ts IMPORTS createMediaSource (which is in media-source.ts).

        // Fix: Use a dynamic import or restructure.
        // Better: Pass the source factory or logic differently.
        // Or simply instantiate DriveMediaSource if we know it's a Drive file.
        // But DriveMediaSource is in media-source.ts.

        // To break the cycle:
        // 1. Move IMediaSource interface to media-source-types.ts (Done).
        // 2. DriveMediaSource depends on InternalMediaProxy.
        // 3. InternalMediaProxy depends on DriveMediaSource (to stream).

        // We can lazy load DriveMediaSource inside the handler.
        const { DriveMediaSource } = await import('./media-source');
        const source = new DriveMediaSource(`gdrive://${fileId}`);

        // Handle Range requests
        const rangeHeader = req.headers.range;
        const totalSize = await source.getSize();
        const mimeType = await source.getMimeType();

        let start = 0;
        let end = totalSize - 1;

        if (rangeHeader) {
          const parts = rangeHeader.replace(/bytes=/, '').split('-');
          start = parseInt(parts[0], 10);
          if (parts[1]) end = parseInt(parts[1], 10);
        }

        const { stream, length } = await source.getStream({ start, end });

        // Calculate the actual end byte being served based on the length returned
        const actualEnd = start + length - 1;

        res.writeHead(206, {
          'Content-Type': mimeType,
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes ${start}-${actualEnd}/${totalSize}`,
          'Content-Length': length,
        });

        stream.pipe(res);

        stream.on('error', (err) => {
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
