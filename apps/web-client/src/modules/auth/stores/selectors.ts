import type { RootState } from '../../../store/store';

export const selectAuthUser = (state: RootState) => state.auth.user;

export const selectAccessToken = (state: RootState) => state.auth.accessToken;

/** True when an access token is present (API calls may proceed; user may still be loading). */
export const selectIsAuthenticated = (state: RootState) =>
  Boolean(state.auth.accessToken);

/** From **`User.emailVerified`** after **`getCurrentUser`** / verify / login (undefined if unknown). */
export const selectEmailVerified = (state: RootState) =>
  state.auth.user?.emailVerified;
