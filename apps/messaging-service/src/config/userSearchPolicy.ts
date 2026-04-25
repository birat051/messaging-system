/**
 * Defaults for **`GET /users/search`** abuse controls — document in `apps/messaging-service/.env.example` and keep
 * **`createSearchUsersQuerySchema`** / **`loadEnv`** defaults aligned.
 */
export const DEFAULT_USER_SEARCH_MIN_QUERY_LENGTH = 3;
export const DEFAULT_USER_SEARCH_MAX_CANDIDATE_SCAN = 200;
