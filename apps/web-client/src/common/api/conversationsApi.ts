import type { components } from '../../generated/api-types';
import { httpClient } from './httpClient';
import { API_PATHS } from './paths';

type S = components['schemas'];

export async function listConversations(params?: {
  cursor?: components['parameters']['CursorQuery'];
  limit?: components['parameters']['LimitQuery'];
}): Promise<S['ConversationPage']> {
  const res = await httpClient.get<S['ConversationPage']>(API_PATHS.conversations.list, {
    params: params ?? {},
  });
  return res.data;
}

export async function listMessages(
  conversationId: string,
  params?: {
    cursor?: components['parameters']['CursorQuery'];
    limit?: components['parameters']['LimitQuery'];
  },
): Promise<S['MessagePage']> {
  const res = await httpClient.get<S['MessagePage']>(
    API_PATHS.conversations.messages(conversationId),
    { params: params ?? {} },
  );
  return res.data;
}
