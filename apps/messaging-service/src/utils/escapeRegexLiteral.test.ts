import { describe, expect, it } from 'vitest';
import { escapeRegexLiteral } from './escapeRegexLiteral.js';

describe('escapeRegexLiteral', () => {
  it('escapes regex metacharacters so the pattern matches literals', () => {
    expect(escapeRegexLiteral('a+b')).toBe('a\\+b');
    expect(escapeRegexLiteral('user@test.com')).toBe('user@test\\.com');
    expect(escapeRegexLiteral('^prefix')).toBe('\\^prefix');
  });
});
