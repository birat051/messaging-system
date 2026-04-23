import { describe, expect, it } from 'vitest';
import { isOptimisticClientMessageId } from './receiptEmitGuards';

describe('receiptEmitGuards', () => {
  it('isOptimisticClientMessageId matches useSendMessage optimistic prefix', () => {
    expect(isOptimisticClientMessageId('client:abc')).toBe(true);
    expect(isOptimisticClientMessageId(' client:abc ')).toBe(true);
    expect(isOptimisticClientMessageId('real-message-id')).toBe(false);
  });
});
