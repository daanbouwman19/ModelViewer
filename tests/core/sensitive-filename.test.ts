import { describe, expect, test } from 'vitest';
import { isSensitiveFilename } from '../../src/core/security';
import {
  SENSITIVE_SUBDIRECTORIES,
  SSH_KEY_PREFIXES,
  SENSITIVE_FILE_PREFIXES,
} from '../../src/core/constants';

describe('isSensitiveFilename Security', () => {
  // Convert Set to Array for parameterized tests
  const sensitiveSubdirs = Array.from(SENSITIVE_SUBDIRECTORIES);

  test.each(sensitiveSubdirs)(
    'blocks sensitive subdirectory: %s',
    (filename) => {
      expect(isSensitiveFilename(filename)).toBe(true);
    },
  );

  test.each(SENSITIVE_FILE_PREFIXES)(
    'blocks sensitive file prefix: %s',
    (prefix) => {
      // Test the prefix itself (if it's a full filename) or with a suffix
      // Some prefixes like 'server.key' are full filenames.
      // Others like 'docker-compose' might be 'docker-compose.yml'.
      // We test the exact prefix match logic.
      expect(isSensitiveFilename(prefix)).toBe(true);
      expect(isSensitiveFilename(`${prefix}.bak`)).toBe(true);
    },
  );

  test.each(SSH_KEY_PREFIXES)('blocks SSH key prefix: %s', (prefix) => {
    expect(isSensitiveFilename(prefix)).toBe(true);
    expect(isSensitiveFilename(`${prefix}.old`)).toBe(true);
  });

  test('allows SSH public keys', () => {
    expect(isSensitiveFilename('id_rsa.pub')).toBe(false);
    expect(isSensitiveFilename('id_dsa.pub')).toBe(false);
  });

  test('handles case insensitivity', () => {
    expect(isSensitiveFilename('ID_RSA')).toBe(true);
    expect(isSensitiveFilename('Server.Key')).toBe(true);
    expect(isSensitiveFilename('.ENV')).toBe(true);
  });

  test('handles empty input safely', () => {
    expect(isSensitiveFilename('')).toBe(false);
  });
});
