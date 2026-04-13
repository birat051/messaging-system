import { describe, expect, it } from 'vitest';
import {
  rankUsersByEmailRelevance,
  rankUsersBySearchRelevance,
} from './search.js';

describe('rankUsersByEmailRelevance', () => {
  it('orders exact match before prefix before substring; ties by email', () => {
    const rows = [
      { email: 'z@x.com' },
      { email: 'ab@y.com' },
      { email: 'a@b.com' },
      { email: 'a@c.com' },
    ];
    const needle = 'a';
    const out = rankUsersByEmailRelevance(rows, needle);
    expect(out.map((r) => r.email)).toEqual([
      'a@b.com',
      'a@c.com',
      'ab@y.com',
      'z@x.com',
    ]);
  });

  it('puts exact email first', () => {
    const rows = [{ email: 'x@y.com' }, { email: 'prefixx@y.com' }];
    const out = rankUsersByEmailRelevance(rows, 'x@y.com');
    expect(out[0]!.email).toBe('x@y.com');
  });
});

describe('rankUsersBySearchRelevance', () => {
  it('ranks by best score across email and username', () => {
    const rows = [
      {
        id: '1',
        email: 'z@x.com',
        username: 'bob',
        displayName: null,
        profilePicture: null,
      },
      {
        id: '2',
        email: 'ab@y.com',
        username: 'alice',
        displayName: null,
        profilePicture: null,
      },
      {
        id: '3',
        email: 'q@q.com',
        username: 'alice_dev',
        displayName: null,
        profilePicture: null,
      },
    ];
    const out = rankUsersBySearchRelevance(rows, 'alice');
    expect(out[0]!.username).toBe('alice');
    expect(out[1]!.username).toBe('alice_dev');
  });
});
