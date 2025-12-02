/**
 * @file Utility for extracting dominant colors from media elements.
 * Uses canvas to sample pixels and calculate the average/dominant color,
 * similar to YouTube's ambient mode effect.
 */

export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

export interface ExtractedColors {
  dominant: RGBColor;
  palette: RGBColor[];
}

/**
 * Creates a canvas context for color extraction.
 * Uses a small canvas size for performance.
 */
function createSamplingCanvas(
  width: number,
  height: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  const canvas = document.createElement('canvas');
  // Use a small size for faster processing
  const maxSize = 64;
  const scale = Math.min(maxSize / width, maxSize / height, 1);
  canvas.width = Math.max(1, Math.floor(width * scale));
  canvas.height = Math.max(1, Math.floor(height * scale));

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  return { canvas, ctx };
}

/**
 * Extracts the dominant color from an HTMLImageElement.
 * @param img - The image element to extract colors from.
 * @returns The extracted colors or null if extraction fails.
 */
export function extractColorsFromImage(
  img: HTMLImageElement,
): ExtractedColors | null {
  if (!img.complete || img.naturalWidth === 0) return null;

  const result = createSamplingCanvas(img.naturalWidth, img.naturalHeight);
  if (!result) return null;

  const { canvas, ctx } = result;

  try {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return extractColorsFromCanvas(ctx, canvas.width, canvas.height);
  } catch {
    // CORS or other errors
    return null;
  }
}

/**
 * Extracts the dominant color from an HTMLVideoElement.
 * @param video - The video element to extract colors from.
 * @returns The extracted colors or null if extraction fails.
 */
export function extractColorsFromVideo(
  video: HTMLVideoElement,
): ExtractedColors | null {
  if (video.readyState < 2 || video.videoWidth === 0) return null;

  const result = createSamplingCanvas(video.videoWidth, video.videoHeight);
  if (!result) return null;

  const { canvas, ctx } = result;

  try {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return extractColorsFromCanvas(ctx, canvas.width, canvas.height);
  } catch {
    // CORS or other errors
    return null;
  }
}

/**
 * Extracts colors from a canvas context by sampling pixels.
 * Uses a simple averaging algorithm with some filtering for better results.
 */
function extractColorsFromCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): ExtractedColors {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let count = 0;

  // Sample pixels, skipping very dark and very bright pixels
  // to get more vibrant/interesting colors
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Calculate luminance
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

    // Skip very dark (< 20) and very bright (> 235) pixels
    if (luminance > 20 && luminance < 235) {
      totalR += r;
      totalG += g;
      totalB += b;
      count++;
    }
  }

  // If we filtered out too many pixels, use all pixels instead
  if (count < (data.length / 4) * 0.1) {
    totalR = 0;
    totalG = 0;
    totalB = 0;
    count = 0;

    for (let i = 0; i < data.length; i += 4) {
      totalR += data[i];
      totalG += data[i + 1];
      totalB += data[i + 2];
      count++;
    }
  }

  const dominant: RGBColor =
    count > 0
      ? {
          r: Math.round(totalR / count),
          g: Math.round(totalG / count),
          b: Math.round(totalB / count),
        }
      : { r: 128, g: 128, b: 128 };

  // For now, just return the dominant color
  // Could be extended to extract a full palette using k-means clustering
  return {
    dominant,
    palette: [dominant],
  };
}

/**
 * Converts an RGB color to a CSS color string.
 */
export function rgbToCss(color: RGBColor, alpha = 1): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

/**
 * Creates a radial gradient CSS value for the ambient glow effect.
 * @param color - The dominant color to use.
 * @returns A CSS gradient string.
 */
export function createAmbientGradient(color: RGBColor): string {
  return `radial-gradient(ellipse at center, ${rgbToCss(color, 0.4)} 0%, ${rgbToCss(color, 0.1)} 50%, transparent 70%)`;
}

/**
 * Interpolates between two colors for smooth transitions.
 * @param from - Starting color.
 * @param to - Target color.
 * @param progress - Progress value between 0 and 1.
 * @returns The interpolated color.
 */
export function interpolateColor(
  from: RGBColor,
  to: RGBColor,
  progress: number,
): RGBColor {
  const t = Math.max(0, Math.min(1, progress));
  return {
    r: Math.round(from.r + (to.r - from.r) * t),
    g: Math.round(from.g + (to.g - from.g) * t),
    b: Math.round(from.b + (to.b - from.b) * t),
  };
}
