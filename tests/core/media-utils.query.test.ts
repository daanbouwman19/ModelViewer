import { describe, it, expect } from 'vitest';
import { getQueryParam } from '../../src/core/media-utils';

describe('getQueryParam', () => {
  it('returns undefined if key is missing', () => {
    const query = {};
    expect(getQueryParam(query, 'missing')).toBeUndefined();
  });

  it('returns value if it is a string', () => {
    const query = { key: 'value' };
    expect(getQueryParam(query, 'key')).toBe('value');
  });

  it('returns first element if value is an array', () => {
    const query = { key: ['first', 'second'] };
    expect(getQueryParam(query, 'key')).toBe('first');
  });

  it('returns undefined if value is undefined', () => {
    const query = { key: undefined };
    expect(getQueryParam(query, 'key')).toBeUndefined();
  });
});
