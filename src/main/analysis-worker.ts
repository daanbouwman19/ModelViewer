/**
 * @file Analysis Worker Thread - Analyzes images for dominant color.
 */
import { parentPort } from 'worker_threads';
import sharp from 'sharp';
import tinycolor from 'tinycolor2';

/**
 * Analyzes an image file to extract its dominant color.
 * @param filePath - The path to the image file.
 * @returns A promise that resolves to the color data.
 */
export async function analyzeImage(filePath: string) {
  const { dominant } = await sharp(filePath).stats();
  const color = tinycolor({ r: dominant.r, g: dominant.g, b: dominant.b });

  return {
    r: dominant.r,
    g: dominant.g,
    b: dominant.b,
    hex: color.toHexString(),
  };
}

if (parentPort) {
  parentPort.on('message', async (message) => {
    const { id, type, payload } = message;
    if (type !== 'analyze') {
      return;
    }

    try {
      const { filePath } = payload;
      const data = await analyzeImage(filePath);

      parentPort!.postMessage({
        id,
        result: {
          success: true,
          data,
        },
      });
    } catch (error: unknown) {
      console.error(
        `[analysis-worker] Error analyzing ${payload.filePath}:`,
        error,
      );
      parentPort!.postMessage({
        id,
        result: { success: false, error: (error as Error).message },
      });
    }
  });
}
