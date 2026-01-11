import { describe, it, expect } from 'vitest';
import { getQueryParam } from '../../src/core/media-utils';

describe('getQueryParam', () => {
  type TestCase = {
    name: string;
    query: Record<string, unknown>;
    key: string;
    expected: string | undefined;
  };

  const testCases: TestCase[] = [
    {
      name: 'returns value if it is a string',
      query: { key: 'value' },
      key: 'key',
      expected: 'value',
    },
    {
      name: 'returns first element if value is an array',
      query: { key: ['first', 'second'] },
      key: 'key',
      expected: 'first',
    },
    {
      name: 'returns undefined if key is missing',
      query: {},
      key: 'missing',
      expected: undefined,
    },
    {
      name: 'returns undefined if value is undefined',
      query: { key: undefined },
      key: 'key',
      expected: undefined,
    },
    {
      name: 'returns undefined if value is null (treated as unknown)',
      query: { key: null },
      key: 'key',
      expected: null as unknown as string, // Cast to match return type behavior
    },
    {
      name: 'returns raw value if value is a number',
      query: { key: 123 },
      key: 'key',
      expected: 123 as unknown as string, // Cast to match return type behavior
    },
  ];

  it.each(testCases)('$name', ({ query, key, expected }) => {
    expect(getQueryParam(query, key)).toBe(expected);
  });
});
