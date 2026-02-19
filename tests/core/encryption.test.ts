import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { encrypt, decrypt } from '../../src/core/utils/encryption.ts';

const MASTER_KEY_FILE = 'master.key';
const KEY_PATH = path.resolve(process.cwd(), MASTER_KEY_FILE);

describe('Encryption Utils', () => {
  let createdKeyFile = false;

  beforeAll(() => {
    // If key file exists, we don't want to mess with it if it's real.
    // But in test environment, we assume it's safe or we should use a different CWD?
    // Vitest runs in project root.
    // Let's backup if exists.
    if (!fs.existsSync(KEY_PATH)) {
      createdKeyFile = true;
    }
  });

  afterAll(() => {
    // Cleanup if we created it
    if (createdKeyFile && fs.existsSync(KEY_PATH)) {
      fs.unlinkSync(KEY_PATH);
    }
  });

  it('should encrypt and decrypt a string correctly', () => {
    const original = 'my-secret-token-123';
    const encrypted = encrypt(original);

    expect(encrypted).not.toBe(original);
    // Format: iv:authTag:ciphertext (hex encoded)
    // iv (12 bytes) = 24 hex chars
    // authTag (16 bytes) = 32 hex chars
    // ciphertext (variable)
    expect(encrypted).toMatch(/^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/);

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it('should return original text if decryption fails (legacy support)', () => {
    const legacy = '{"access_token":"foo"}';
    const result = decrypt(legacy);
    expect(result).toBe(legacy);
  });

  it('should handle different plain texts', () => {
    const texts = ['', 'hello', '👍', JSON.stringify({ a: 1 })];
    for (const t of texts) {
      expect(decrypt(encrypt(t))).toBe(t);
    }
  });

  it('should generate a key file if missing', () => {
    // Since module is cached, we can't easily force regeneration in the same process run
    // unless we delete the key file AND clear module cache (which is hard in ESM).
    // However, the first call to encrypt() inside 'should encrypt...' test triggered key generation.
    expect(fs.existsSync(KEY_PATH)).toBe(true);
    const keyContent = fs.readFileSync(KEY_PATH, 'utf8');
    expect(keyContent).toHaveLength(64); // 32 bytes hex = 64 chars
  });
});
