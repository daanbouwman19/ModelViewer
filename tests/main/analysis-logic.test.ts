import { describe, it, expect, vi } from 'vitest';
import { analyzeImage } from '../../src/main/analysis-worker';

// Mock sharp
vi.mock('sharp', () => {
  return {
    default: vi.fn().mockReturnValue({
      stats: vi.fn().mockResolvedValue({
        dominant: { r: 100, g: 150, b: 200 },
      }),
    }),
  };
});

// Mock tinycolor2
vi.mock('tinycolor2', () => {
  return {
    default: vi.fn().mockReturnValue({
      toHexString: vi.fn().mockReturnValue('#6496c8'),
    }),
  };
});

describe('Analysis Logic', () => {
  it('should extract color from image', async () => {
    const result = await analyzeImage('/path/to/fake.jpg');

    expect(result).toEqual({
      r: 100,
      g: 150,
      b: 200,
      hex: '#6496c8',
    });
  });
});
