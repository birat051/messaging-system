import { findDirectConversationIdBetween } from '../conversations/repo.js';
import {
  findUsersBySearchSubstringMatch,
  type UserSearchRow,
} from './repo.js';
import type { UserSearchResult } from './users.types.js';

/**
 * **Scoring:** per-field exact **3** → prefix **2** → substring **1**; take **max(email, username)**;
 * tie-break by **`email`** ascending.
 */
export function rankUsersBySearchRelevance<T extends UserSearchRow>(
  rows: T[],
  normalizedNeedle: string,
): T[] {
  const scored = rows.map((r) => ({
    r,
    score: scoreSearchRow(r, normalizedNeedle),
  }));
  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.r.email.localeCompare(b.r.email);
  });
  return scored.map((s) => s.r);
}

function scoreSearchRow(row: UserSearchRow, needle: string): number {
  const emailScore = scoreSubstringField(row.email, needle);
  const u = row.username;
  const usernameScore = u ? scoreSubstringField(u, needle) : 0;
  return Math.max(emailScore, usernameScore);
}

function scoreSubstringField(field: string, needle: string): number {
  if (field === needle) {
    return 3;
  }
  if (field.startsWith(needle)) {
    return 2;
  }
  return 1;
}

/** @deprecated Use **`rankUsersBySearchRelevance`** */
export function rankUsersByEmailRelevance<T extends { email: string }>(
  rows: T[],
  normalizedNeedle: string,
): T[] {
  const scored = rows.map((r) => ({
    r,
    score: scoreSubstringField(r.email, normalizedNeedle),
  }));
  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.r.email.localeCompare(b.r.email);
  });
  return scored.map((s) => s.r);
}

/**
 * **`GET /users/search`** — **substring** match on normalized **`email`** and **`username`**
 * (escaped regex; case-insensitive).
 *
 * **Ordering:** relevance score, then **`email`** lexicographically.
 *
 * **Limits:** per-IP Redis rate limit; **`limit`** caps response size; **`maxCandidateScanCap`**
 * bounds MongoDB work (see **`USER_SEARCH_MAX_CANDIDATE_SCAN`**).
 */
export async function searchUsersForCaller(params: {
  callerUserId: string;
  /** Trimmed + lowercased by Zod. */
  query: string;
  /** Effective page size (**`LimitQuery`**). */
  limit: number;
  /** Upper bound on MongoDB documents scanned for this request (env-tunable). */
  maxCandidateScanCap: number;
}): Promise<UserSearchResult[]> {
  const needle = params.query;
  const maxCandidates = Math.min(
    Math.max(params.limit * 25, params.limit),
    params.maxCandidateScanCap,
  );

  const candidates = await findUsersBySearchSubstringMatch({
    normalizedNeedle: needle,
    excludeUserId: params.callerUserId,
    maxCandidates,
  });

  const ranked = rankUsersBySearchRelevance<UserSearchRow>(candidates, needle);
  const top = ranked.slice(0, params.limit);

  const rows: UserSearchResult[] = await Promise.all(
    top.map(async (u) => {
      const conversationId = await findDirectConversationIdBetween(
        params.callerUserId,
        u.id,
      );
      return {
        userId: u.id,
        username: u.username ?? null,
        displayName: u.displayName,
        profilePicture: u.profilePicture ?? null,
        conversationId,
      };
    }),
  );

  return rows;
}
