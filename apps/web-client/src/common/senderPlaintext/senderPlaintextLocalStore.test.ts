import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  __deleteSenderPlaintextDbForTests,
  clearUser,
  deleteEntry,
  get,
  getAll,
  open,
  put,
} from './senderPlaintextLocalStore';

const U1 = 'user-aaaaaaaa-bbbb-cccc-dddddddddddd';
const U2 = 'user-bbbbbbbb-cccc-dddd-eeeeeeeeeeee';

describe('senderPlaintextLocalStore', () => {
  afterEach(async () => {
    await __deleteSenderPlaintextDbForTests();
  });

  it('open resolves', async () => {
    await expect(open()).resolves.toBeUndefined();
  });

  it('put, get, getAll, deleteEntry, clearUser', async () => {
    await put(U1, 'msg-1', 'hello');
    await put(U1, 'msg-2', 'world');
    expect(await get(U1, 'msg-1')).toBe('hello');
    expect(await get(U1, 'msg-2')).toBe('world');
    expect(await get(U1, 'missing')).toBeNull();

    const all = await getAll(U1);
    expect(all).toEqual({ 'msg-1': 'hello', 'msg-2': 'world' });
    expect(await getAll(U2)).toEqual({});

    await deleteEntry(U1, 'msg-1');
    expect(await get(U1, 'msg-1')).toBeNull();
    expect(await getAll(U1)).toEqual({ 'msg-2': 'world' });

    await clearUser(U1);
    expect(await getAll(U1)).toEqual({});
  });

  it('isolates users', async () => {
    await put(U1, 'm1', 'a');
    await put(U2, 'm1', 'b');
    expect(await get(U1, 'm1')).toBe('a');
    expect(await get(U2, 'm1')).toBe('b');
    await clearUser(U1);
    expect(await get(U2, 'm1')).toBe('b');
    await clearUser(U2);
  });
});
