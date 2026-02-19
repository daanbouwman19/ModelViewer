import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// We need to reset modules to clear cachedKey
beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.clearAllMocks();
});

const MASTER_KEY_FILE = 'master.key';
const KEY_PATH = path.resolve(process.cwd(), MASTER_KEY_FILE);

describe('Encryption Utils Coverage', () => {
  it('should use MASTER_KEY from environment variable', async () => {
    const mockKey = crypto.randomBytes(32).toString('hex');
    vi.stubEnv('MASTER_KEY', mockKey);

    const { encrypt, decrypt } =
      await import('../../src/core/utils/encryption');
    const text = 'test-env-key';
    const encrypted = encrypt(text);
    expect(decrypt(encrypted)).toBe(text);
  });

  it('should throw if MASTER_KEY is invalid length', async () => {
    vi.stubEnv('MASTER_KEY', 'short-key');
    const { encrypt } = await import('../../src/core/utils/encryption');
    expect(() => encrypt('test')).toThrow(/Invalid MASTER_KEY length/);
  });

  it('should regenerate key if master.key has invalid length', async () => {
    const consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => {});
    const writeSpy = vi.spyOn(fs, 'writeFileSync');

    // Create a dummy file with invalid length
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('short-hex');

    const { encrypt } = await import('../../src/core/utils/encryption');
    encrypt('test');

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid key length'),
    );
    // Should have generated a new key (check writeFileSync was called)
    expect(writeSpy).toHaveBeenCalled();
  });

  it('should handle read error for master.key gracefully', async () => {
    const consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => {});
    const writeSpy = vi.spyOn(fs, 'writeFileSync');

    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('Read permission denied');
    });

    const { encrypt } = await import('../../src/core/utils/encryption');
    encrypt('test');

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to read'),
      expect.any(Error),
    );
    // Should proceed to generate new key
    expect(writeSpy).toHaveBeenCalled();
  });

  it('should log error if writing master.key fails', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
      throw new Error('Write permission denied');
    });

    const { encrypt } = await import('../../src/core/utils/encryption');
    // Should not throw, just log error and use in-memory key
    expect(() => encrypt('test')).not.toThrow();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to write'),
      expect.any(Error),
    );
  });

  it('should return original text if decryption throws internally', async () => {
    const consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => {});
    const { encrypt, decrypt } =
      await import('../../src/core/utils/encryption');

    const plain = 'secret';
    const encrypted = encrypt(plain);

    // Mock crypto.createDecipheriv to throw
    vi.spyOn(crypto, 'createDecipheriv').mockImplementation(() => {
      throw new Error('Decipher error');
    });

    const result = decrypt(encrypted);
    expect(result).toBe(encrypted); // Fallback to returning input
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Decryption failed'),
      expect.any(String),
    );
  });
});
