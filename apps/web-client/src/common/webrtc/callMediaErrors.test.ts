import { describe, expect, it } from 'vitest';
import { describeMediaAccessError } from './callMediaErrors';

describe('describeMediaAccessError', () => {
  it('maps NotAllowedError to permission copy', () => {
    expect(
      describeMediaAccessError(
        Object.assign(new Error('x'), { name: 'NotAllowedError' }),
      ),
    ).toMatch(/Allow media permissions/i);
  });

  it('maps NotFoundError to device copy', () => {
    expect(
      describeMediaAccessError(
        Object.assign(new Error('x'), { name: 'NotFoundError' }),
      ),
    ).toMatch(/no microphone/i);
  });

  it('falls back to Error.message when name unknown', () => {
    expect(describeMediaAccessError(new Error('oops'))).toBe('oops');
  });
});
