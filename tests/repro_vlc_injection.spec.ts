import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as security from '../src/core/security';
import * as vlcPaths from '../src/core/utils/vlc-paths';

const { spawnMock } = vi.hoisted(() => {
  return {
    spawnMock: vi.fn(() => ({
      unref: vi.fn(),
      on: vi.fn(),
    })),
  };
});

vi.mock('child_process', () => {
  return {
    spawn: spawnMock,
    default: { spawn: spawnMock },
  };
});

import { openMediaInVlc } from '../src/core/vlc-player';

vi.mock('../src/core/security', () => ({
  authorizeFilePath: vi.fn(),
}));

vi.mock('../src/core/utils/vlc-paths', () => ({
  getVlcPath: vi.fn(),
}));

describe('VLC Player Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(vlcPaths.getVlcPath).mockResolvedValue('/usr/bin/vlc');
    vi.mocked(security.authorizeFilePath).mockResolvedValue({
      isAllowed: true,
      realPath: '/path/to/file',
    });
  });

  it('should prevent argument injection when opening local file', async () => {
    const maliciousFile = '--malicious-flag.mp4';

    await openMediaInVlc(maliciousFile, 3000);

    expect(spawnMock).toHaveBeenCalled();
    const args = spawnMock.mock.calls[0][1];
    // The test asserts the secure behavior: ['--', file]
    expect(args).toEqual(['--', maliciousFile]);
  });
});
