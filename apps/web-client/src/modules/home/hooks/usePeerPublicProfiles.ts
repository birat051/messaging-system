import { useMemo } from 'react';
import useSWR from 'swr';
import type { components } from '@/generated/api-types';
import { getUserById } from '@/common/api/usersApi';

type UserPublic = components['schemas']['UserPublic'];

/**
 * Loads **`GET /users/{userId}`** (**`UserPublic`**) for each id — parallel requests, one SWR cache entry.
 * Missing ids resolve to **`null`** in the map when the request fails.
 *
 * **Home shell / list titles:** **`HomeConversationShell`** uses this map with **`formatUserPublicLabel`** /
 * **`formatMissingPeerProfileLabel`**. If **`GET /users/{userId}`** is unavailable, every peer resolves to
 * **`null`** → **“Unknown contact · …”** (see **`userPublicLabel.ts`**).
 */
export function usePeerPublicProfiles(userIds: (string | null | undefined)[]) {
  const sortedKey = useMemo(() => {
    const u = [
      ...new Set(
        userIds
          .map((id) => id?.trim())
          .filter((id): id is string => Boolean(id)),
      ),
    ].sort();
    return u.join('\u0001');
  }, [userIds]);

  return useSWR(
    sortedKey ? (['peerPublicProfiles', sortedKey] as const) : null,
    async ([, key]) => {
      const ids = key.split('\u0001');
      const entries = await Promise.all(
        ids.map(async (id) => {
          try {
            const u = await getUserById(id);
            return [id, u] as const;
          } catch {
            return [id, null] as const;
          }
        }),
      );
      return Object.fromEntries(entries) as Record<string, UserPublic | null>;
    },
    { revalidateOnFocus: false },
  );
}
