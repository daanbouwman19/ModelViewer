import { describe, it, expect, afterEach } from 'vitest';
import path from 'path';
import { resolveWorkerPath } from '../../../src/core/utils/worker-utils';

describe('resolveWorkerPath', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('returns a packaged Electron worker path', async () => {
    const result = await resolveWorkerPath(
      true,
      true,
      'C:/app/dist',
      'file:///C:/app/src/index.ts',
      'scan-worker',
    );

    expect(path.normalize(result.path as string)).toBe(
      path.normalize('C:/app/dist/scan-worker.js'),
    );
    expect(result.options).toBeUndefined();
  });

  it('returns a dev Electron worker URL', async () => {
    const result = await resolveWorkerPath(
      true,
      false,
      'C:/app/dist',
      'file:///C:/app/src/index.ts',
      'scan-worker',
    );

    expect(result.path).toBeInstanceOf(URL);
    expect((result.path as URL).href).toContain('/scan-worker.js');
    expect(result.options).toBeUndefined();
  });

  it('returns a production server worker path', async () => {
    process.env.NODE_ENV = 'production';

    const result = await resolveWorkerPath(
      false,
      false,
      'C:/app/server',
      'file:///C:/app/server/main.ts',
      'scan-worker',
    );

    expect(path.normalize(result.path as string)).toBe(
      path.normalize('C:/app/server/scan-worker.js'),
    );
    expect(result.options).toBeUndefined();
  });

  it('returns a dev server worker URL with tsx execArgv', async () => {
    process.env.NODE_ENV = 'development';

    const result = await resolveWorkerPath(
      false,
      false,
      'C:/app/server',
      'file:///C:/app/server/main.ts',
      'scan-worker',
    );

    expect(result.path).toBeInstanceOf(URL);
    expect((result.path as URL).href).toContain('/scan-worker.ts');
    expect(result.options).toEqual({ execArgv: ['--import', 'tsx'] });
  });
});
