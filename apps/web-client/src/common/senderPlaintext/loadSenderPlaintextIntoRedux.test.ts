import 'fake-indexeddb/auto';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, describe, expect, it } from 'vitest';
import { messagingReducer } from '@/modules/home/stores/messagingSlice';
import { loadSenderPlaintextIntoRedux } from './loadSenderPlaintextIntoRedux';
import * as senderPlaintextLocalStore from './senderPlaintextLocalStore';

describe('loadSenderPlaintextIntoRedux', () => {
  afterEach(async () => {
    await senderPlaintextLocalStore.__deleteSenderPlaintextDbForTests();
  });

  it('dispatches persisted rows into messaging state', async () => {
    const userId = 'user-abc';
    await senderPlaintextLocalStore.put(userId, 'msg-1', 'stored plain');
    const store = configureStore({
      reducer: { messaging: messagingReducer },
    });
    await loadSenderPlaintextIntoRedux(store.dispatch, userId);
    expect(store.getState().messaging.senderPlaintextByMessageId).toEqual({
      'msg-1': 'stored plain',
    });
  });

  it('no-ops for empty user id', async () => {
    const store = configureStore({
      reducer: { messaging: messagingReducer },
    });
    await loadSenderPlaintextIntoRedux(store.dispatch, '   ');
    expect(store.getState().messaging.senderPlaintextByMessageId).toEqual({});
  });
});
