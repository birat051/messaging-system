import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import type { components } from '@/generated/api-types';
import { renderWithProviders } from '@/common/test-utils';
import { RegisterPage } from '@/modules/auth/pages/RegisterPage';
import { GuestSessionBanner } from '@/modules/home/components/GuestSessionBanner';
import { HomePage } from '@/modules/home/pages/HomePage';
import { registerPathFromGuest } from '@/routes/paths';

const guestUser = {
  id: 'guest-flow-1',
  email: null,
  username: 'sandbox_flow',
  displayName: null,
  emailVerified: false,
  profilePicture: null,
  status: null,
  guest: true as const,
};

const guestPreload = {
  auth: {
    user: guestUser,
    accessToken: 'guest-access-token',
    accessTokenExpiresAt: '2030-01-01T12:00:00.000Z',
  },
};

function GuestHomeWithBannerOnly() {
  return (
    <div data-testid="guest-home-banner-only">
      <GuestSessionBanner />
    </div>
  );
}

vi.mock('@/common/realtime/SocketWorkerProvider', () => ({
  useSocketWorker: () => ({
    emitReceipt: vi.fn().mockResolvedValue(undefined),
    emitWebRtcSignaling: vi.fn().mockResolvedValue(undefined),
    getLastSeen: vi.fn().mockResolvedValue({ status: 'not_available' as const }),
    setWebRtcInboundHandler: vi.fn(),
    status: { kind: 'connected', socketId: 'sk-test' },
    sendMessage: vi.fn(),
  }),
}));

vi.mock('@/modules/home/hooks/useConversation', () => ({
  useConversation: () => ({
    isLoading: false,
    isValidating: false,
    error: null,
  }),
}));

vi.mock('@/common/hooks/useSendEncryptedMessage', async () => {
  const { mockSendMessageSocketLike } = await import(
    '@/common/test-utils/mockSendMessageForVitest'
  );
  return {
    useSendEncryptedMessage: () => ({
      sendMessage: async (payload: components['schemas']['SendMessageRequest']) =>
        mockSendMessageSocketLike(payload),
    }),
  };
});

describe('Guest → Create account (register stays open; no bounce to home)', () => {
  it('from guest banner only: navigates to register and keeps the form (guest session + ?from=guest)', async () => {
    const u = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/" element={<GuestHomeWithBannerOnly />} />
        <Route path="/register" element={<RegisterPage />} />
      </Routes>,
      { route: '/', preloadedState: guestPreload },
    );

    expect(screen.getByTestId('guest-home-banner-only')).toBeInTheDocument();

    const banner = screen.getByRole('region', { name: /guest session/i });
    const create = within(banner).getByRole('link', { name: /^create account$/i });
    expect(create).toHaveAttribute('href', registerPathFromGuest());

    await u.click(create);

    await waitFor(() => {
      expect(
        screen.getByRole('textbox', { name: /^email$/i }),
      ).toBeInTheDocument();
    });

    expect(
      document.querySelector('[data-register-from-guest="true"]'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('guest-home-banner-only')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByRole('textbox', { name: /^display name$/i }),
      ).toBeInTheDocument();
    });
  });

  it('from HomePage (banner + header links): register screen remains after navigation', async () => {
    const u = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Routes>,
      { route: '/', preloadedState: guestPreload },
    );

    const shell = await screen.findByTestId('home-page-shell');
    const createLinks = within(shell).getAllByRole('link', {
      name: /^create account$/i,
    });
    expect(createLinks.length).toBeGreaterThanOrEqual(1);
    expect(
      createLinks.some((el) => el.getAttribute('href') === registerPathFromGuest()),
    ).toBe(true);

    await u.click(createLinks[0]!);

    await waitFor(() => {
      expect(
        screen.getByRole('textbox', { name: /^email$/i }),
      ).toBeInTheDocument();
    });
    expect(
      document.querySelector('[data-register-from-guest="true"]'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('home-page-shell')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /^register$/i }),
      ).toBeInTheDocument();
    });
  });
});
