import { lazy } from 'react';

/** Route-level code splits — named page exports wrapped for **`React.lazy`** (uses **`@/modules/*`** alias). */
export const HomePage = lazy(() =>
  import('@/modules/home/pages/HomePage').then((m) => ({ default: m.HomePage })),
);

export const LandingPage = lazy(() =>
  import('@/modules/auth/pages/LandingPage').then((m) => ({
    default: m.LandingPage,
  })),
);

export const LoginPage = lazy(() =>
  import('@/modules/auth/pages/LoginPage').then((m) => ({ default: m.LoginPage })),
);

export const GuestEntryPage = lazy(() =>
  import('@/modules/auth/pages/GuestEntryPage').then((m) => ({
    default: m.GuestEntryPage,
  })),
);

export const RegisterPage = lazy(() =>
  import('@/modules/auth/pages/RegisterPage').then((m) => ({ default: m.RegisterPage })),
);

export const SettingsPage = lazy(() =>
  import('@/modules/settings/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);

export const VerifyEmailPage = lazy(() =>
  import('@/modules/auth/pages/VerifyEmailPage').then((m) => ({
    default: m.VerifyEmailPage,
  })),
);
