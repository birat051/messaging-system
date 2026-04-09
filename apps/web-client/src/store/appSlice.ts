import { createSlice } from '@reduxjs/toolkit';

/**
 * Placeholder root slice until feature slices (e.g. auth) are registered.
 * Keeps `configureStore` valid with a non-empty reducer map.
 */
export type AppState = {
  bootstrapped: boolean;
};

const initialState: AppState = {
  bootstrapped: true,
};

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {},
});

export const { reducer: appReducer } = appSlice;
