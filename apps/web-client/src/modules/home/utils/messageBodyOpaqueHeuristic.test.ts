import { describe, expect, it } from 'vitest';
import { looksLikeOpaqueCiphertextBody } from './messageBodyOpaqueHeuristic';

describe('looksLikeOpaqueCiphertextBody', () => {
  it('is true for long base64-ish strings without spaces', () => {
    expect(looksLikeOpaqueCiphertextBody('aCbkLLXatRIo1p/5ZKMu4Fe0')).toBe(true);
    expect(looksLikeOpaqueCiphertextBody('Ym9keQ==')).toBe(false);
  });

  it('is false for plain sentences and short strings', () => {
    expect(looksLikeOpaqueCiphertextBody('hello world')).toBe(false);
    expect(looksLikeOpaqueCiphertextBody('hi')).toBe(false);
  });

  it('is false when charset is not base64-ish', () => {
    expect(looksLikeOpaqueCiphertextBody('hello:{"v":1}')).toBe(false);
  });
});
