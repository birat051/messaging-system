import { describe, expect, it } from 'vitest';
import { rankUsersBySearchRelevance } from './search.js';

describe('rankUsersBySearchRelevance', () => {
  it('ranks by best score across email and username', () => {
    const rows = [
      {
        id: '1',
        email: 'z@x.com',
        username: 'bob',
        displayName: null,
        profilePicture: null,
        isGuest: undefined,
      },
      {
        id: '2',
        email: 'ab@y.com',
        username: 'alice',
        displayName: null,
        profilePicture: null,
        isGuest: undefined,
      },
      {
        id: '3',
        email: 'q@q.com',
        username: 'alice_dev',
        displayName: null,
        profilePicture: null,
        isGuest: undefined,
      },
    ];
    const out = rankUsersBySearchRelevance(rows, 'alice');
    expect(out[0]!.username).toBe('alice');
    expect(out[1]!.username).toBe('alice_dev');
  });
});
