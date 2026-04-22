import { describe, expect, it } from 'vitest';
import {
  applyConversationBumpedActivity,
  sortConversationsNewestFirst,
} from './conversationListCache';

describe('conversationListCache', () => {
  it('sortConversationsNewestFirst orders by updatedAt descending', () => {
    const items = [
      { id: 'a', updatedAt: '2026-01-01T10:00:00.000Z' },
      { id: 'b', updatedAt: '2026-01-03T10:00:00.000Z' },
      { id: 'c', updatedAt: '2026-01-02T10:00:00.000Z' },
    ];
    const sorted = sortConversationsNewestFirst(items);
    expect(sorted.map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });

  it('applyConversationBumpedActivity moves thread to top with new updatedAt', () => {
    const page = {
      items: [
        { id: 'top', updatedAt: '2026-01-05T10:00:00.000Z' },
        { id: 'old', updatedAt: '2026-01-01T10:00:00.000Z' },
      ],
      hasMore: false,
    };
    const { next, found } = applyConversationBumpedActivity(
      page,
      'old',
      '2026-01-10T12:00:00.000Z',
    );
    expect(found).toBe(true);
    expect(next.items.map((x) => x.id)).toEqual(['old', 'top']);
    expect(next.items[0].updatedAt).toBe('2026-01-10T12:00:00.000Z');
  });

  it('applyConversationBumpedActivity returns found false when id missing', () => {
    const page = { items: [{ id: 'x', updatedAt: '2026-01-01T10:00:00.000Z' }], hasMore: false };
    const { found } = applyConversationBumpedActivity(
      page,
      'missing',
      '2026-01-02T10:00:00.000Z',
    );
    expect(found).toBe(false);
  });
});
