import { describe, expect, it } from 'vitest';
import { resolveRestCorsOrigin } from './restCors.js';

describe('resolveRestCorsOrigin', () => {
  it('treats * as wildcard', () => {
    expect(resolveRestCorsOrigin('*')).toBe('*');
    expect(resolveRestCorsOrigin(' * ')).toBe('*');
  });

  it('returns single non-wildcard origin unchanged', () => {
    expect(resolveRestCorsOrigin('https://app.example.com')).toBe(
      'https://app.example.com',
    );
  });

  it('splits comma-separated origins into an array', () => {
    expect(
      resolveRestCorsOrigin(
        'https://a.example.com, https://b.example.com',
      ),
    ).toEqual(['https://a.example.com', 'https://b.example.com']);
  });
});
