import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { encrypt, decrypt } from '../../src/core/utils/encryption.ts';
import crypto from 'crypto';

describe('Encryption Utils', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();

    // Inject a dummy key via env var to avoid FS operations
    const mockKey = crypto.randomBytes(32).toString('hex');
    vi.stubEnv('MASTER_KEY', mockKey);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should encrypt and decrypt a string correctly', () => {
    const original = 'my-secret-token-123';
    const encrypted = encrypt(original);

    expect(encrypted).not.toBe(original);
    // Format: iv:authTag:ciphertext (hex encoded)
    // iv (12 bytes) = 24 hex chars
    // authTag (16 bytes) = 32 hex chars
    // ciphertext (variable)
    expect(encrypted).toMatch(/^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]*$/);

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it('should return original text if decryption fails (legacy support)', () => {
    const legacy = '{"access_token":"foo"}';
    const result = decrypt(legacy);
    expect(result).toBe(legacy);
  });

  it('should return original text if format looks valid but lengths are wrong', () => {
    // Correct format but wrong lengths (too short auth tag)
    const invalid = '000000000000000000000000:0000:deadbeef';
    const result = decrypt(invalid);
    expect(result).toBe(invalid);
  });

  it('should handle different plain texts', () => {
    const texts = ['', 'hello', '👍', JSON.stringify({ a: 1 })];
    for (const t of texts) {
      expect(decrypt(encrypt(t))).toBe(t);
    }
  });
});
