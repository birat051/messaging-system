import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as deviceBootstrap from '@/common/crypto/deviceBootstrapSync';
import * as usersApi from '@/common/api/usersApi';
import { defaultMockUser } from '@/common/mocks/handlers';
import { renderWithProviders } from '@/common/test-utils';
import { DeviceSyncApprovalBanner } from './DeviceSyncApprovalBanner';
import { NewDeviceSyncBanner } from './NewDeviceSyncBanner';

const approveDeviceKeySync = vi.fn().mockResolvedValue(undefined);

vi.mock('@/modules/crypto/hooks/useDeviceKeySync', () => ({
  useDeviceKeySync: () => ({
    approveDeviceKeySync,
    isApproving: false,
  }),
}));

describe('NewDeviceSyncBanner', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when syncState is idle', () => {
    renderWithProviders(<NewDeviceSyncBanner />, {
      preloadedState: {
        auth: {
          user: { ...defaultMockUser, emailVerified: true },
          accessToken: 't',
        },
        crypto: {
          registeredOnServer: true,
          keyVersion: 1,
          deviceId: 'my-dev',
          registeredPublicKeySpki: 'pk',
          lastUpdatedAt: '2026-01-01T00:00:00.000Z',
          status: 'succeeded',
          error: null,
          syncState: 'idle',
        },
      },
    });

    expect(
      screen.queryByRole('region', { name: /new device sync/i }),
    ).not.toBeInTheDocument();
  });

  it('renders pending state (region, copy, no spinner)', async () => {
    vi.spyOn(usersApi, 'listMySyncMessageKeys').mockResolvedValue({
      items: [],
      hasMore: false,
      nextAfterMessageId: null,
    });
    vi.spyOn(usersApi, 'listMyDevices').mockResolvedValue({
      items: [
        {
          deviceId: 'my-dev',
          deviceLabel: 'This browser',
          createdAt: '2026-04-01T10:00:00.000Z',
          lastSeenAt: '2026-04-01T12:00:00.000Z',
          publicKey: 'pk-my-dev',
        },
        {
          deviceId: 'trusted-phone',
          deviceLabel: 'Pixel — Messages',
          createdAt: '2026-03-01T08:00:00.000Z',
          lastSeenAt: '2026-04-01T11:00:00.000Z',
          publicKey: 'pk-phone',
        },
      ],
    });

    const { store } = renderWithProviders(<NewDeviceSyncBanner />, {
      preloadedState: {
        auth: {
          user: { ...defaultMockUser, emailVerified: true },
          accessToken: 't',
        },
        crypto: {
          registeredOnServer: true,
          keyVersion: 1,
          deviceId: 'my-dev',
          registeredPublicKeySpki: 'pk',
          lastUpdatedAt: '2026-04-01T12:00:00.000Z',
          status: 'succeeded',
          error: null,
          syncState: 'pending',
        },
      },
    });

    expect(store.getState().crypto.syncState).toBe('pending');

    const banner = screen.getByRole('region', { name: /new device sync/i });
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveAttribute('data-testid', 'new-device-sync-banner');
    expect(banner).toHaveTextContent(
      /this is a new device\. open the app on another device you trust to sync your message history\./i,
    );
    expect(banner).toHaveTextContent(/send and receive new messages/i);
    expect(screen.queryByTestId('new-device-sync-spinner')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(usersApi.listMyDevices).toHaveBeenCalled();
    });
  });

  it('shows other device list (excludes this device)', async () => {
    vi.spyOn(usersApi, 'listMySyncMessageKeys').mockResolvedValue({
      items: [],
      hasMore: false,
      nextAfterMessageId: null,
    });
    vi.spyOn(usersApi, 'listMyDevices').mockResolvedValue({
      items: [
        {
          deviceId: 'my-dev',
          deviceLabel: 'This browser',
          createdAt: '2026-04-01T10:00:00.000Z',
          lastSeenAt: '2026-04-01T12:00:00.000Z',
          publicKey: 'pk-my-dev',
        },
        {
          deviceId: 'trusted-phone',
          deviceLabel: 'Pixel — Messages',
          createdAt: '2026-03-01T08:00:00.000Z',
          lastSeenAt: '2026-04-01T11:00:00.000Z',
          publicKey: 'pk-phone',
        },
      ],
    });

    renderWithProviders(<NewDeviceSyncBanner />, {
      preloadedState: {
        auth: {
          user: { ...defaultMockUser, emailVerified: true },
          accessToken: 't',
        },
        crypto: {
          registeredOnServer: true,
          keyVersion: 1,
          deviceId: 'my-dev',
          registeredPublicKeySpki: 'pk',
          lastUpdatedAt: '2026-04-01T12:00:00.000Z',
          status: 'succeeded',
          error: null,
          syncState: 'pending',
        },
      },
    });

    const list = await screen.findByRole('list', {
      name: /other registered devices/i,
    });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(list).toHaveTextContent(/pixel — messages/i);
    expect(list).not.toHaveTextContent(/this browser/i);
  });

  it('invokes evaluateDeviceSyncBootstrapState while pending', async () => {
    vi.spyOn(usersApi, 'listMySyncMessageKeys').mockResolvedValue({
      items: [],
      hasMore: false,
      nextAfterMessageId: null,
    });
    vi.spyOn(usersApi, 'listMyDevices').mockResolvedValue({
      items: [
        {
          deviceId: 'my-dev',
          deviceLabel: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          lastSeenAt: '2026-01-01T00:00:00.000Z',
          publicKey: 'pk-a',
        },
        {
          deviceId: 'other',
          deviceLabel: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          lastSeenAt: '2026-01-01T00:00:00.000Z',
          publicKey: 'pk-b',
        },
      ],
    });

    const spy = vi
      .spyOn(deviceBootstrap, 'evaluateDeviceSyncBootstrapState')
      .mockResolvedValue('pending');

    renderWithProviders(<NewDeviceSyncBanner />, {
      preloadedState: {
        auth: {
          user: { ...defaultMockUser, emailVerified: true },
          accessToken: 't',
        },
        crypto: {
          registeredOnServer: true,
          keyVersion: 1,
          deviceId: 'my-dev',
          registeredPublicKeySpki: 'pk',
          lastUpdatedAt: '2026-01-01T00:00:00.000Z',
          status: 'succeeded',
          error: null,
          syncState: 'pending',
        },
      },
    });

    await waitFor(() => {
      expect(spy).toHaveBeenCalled();
    });
    expect(spy.mock.calls[0]?.[1]).toBe('my-dev');

    spy.mockRestore();
  });

  it('shows a spinner when sync is in progress', async () => {
    vi.spyOn(usersApi, 'listMySyncMessageKeys').mockResolvedValue({
      items: [],
      hasMore: false,
      nextAfterMessageId: null,
    });
    vi.spyOn(usersApi, 'listMyDevices').mockResolvedValue({
      items: [
        {
          deviceId: 'a',
          deviceLabel: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          lastSeenAt: '2026-01-01T00:00:00.000Z',
          publicKey: 'pk-a',
        },
        {
          deviceId: 'b',
          deviceLabel: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          lastSeenAt: '2026-01-01T00:00:00.000Z',
          publicKey: 'pk-b',
        },
      ],
    });

    renderWithProviders(<NewDeviceSyncBanner />, {
      preloadedState: {
        auth: {
          user: { ...defaultMockUser, emailVerified: true },
          accessToken: 't',
        },
        crypto: {
          registeredOnServer: true,
          keyVersion: 1,
          deviceId: 'b',
          registeredPublicKeySpki: 'pk',
          lastUpdatedAt: '2026-01-01T00:00:00.000Z',
          status: 'succeeded',
          error: null,
          syncState: 'in_progress',
        },
      },
    });

    expect(
      screen.getByTestId('new-device-sync-spinner'),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('list', { name: /other registered devices/i })).toBeInTheDocument();
    });
  });
});

/**
 * Trusted-device approval UI (**`DeviceSyncApprovalBanner`**). Checklist groups these with
 * **`NewDeviceSyncBanner.test.tsx`** (Approve / **`useDeviceKeySync`**, **`syncDismissed`**).
 */
describe('DeviceSyncApprovalBanner (trusted device)', () => {
  beforeEach(() => {
    approveDeviceKeySync.mockClear();
  });

  it('renders nothing when there is no pending device sync request', () => {
    renderWithProviders(<DeviceSyncApprovalBanner />, {
      preloadedState: {
        auth: { user: defaultMockUser, accessToken: 't', accessTokenExpiresAt: null },
        crypto: {
          registeredOnServer: true,
          keyVersion: 1,
          deviceId: 'dev-trusted',
          registeredPublicKeySpki: 'pk',
          lastUpdatedAt: '2026-01-01T00:00:00.000Z',
          status: 'succeeded',
          error: null,
          syncState: 'idle',
          pendingSyncFromDeviceId: null,
          pendingSyncFromDevicePublicKey: null,
          syncCompletedForNewDeviceId: null,
        },
      },
    });
    expect(screen.queryByTestId('device-sync-approval-banner')).not.toBeInTheDocument();
  });

  it('renders when pending sync is set (Approve / Dismiss)', () => {
    renderWithProviders(<DeviceSyncApprovalBanner />, {
      preloadedState: {
        auth: { user: defaultMockUser, accessToken: 't', accessTokenExpiresAt: null },
        crypto: {
          registeredOnServer: true,
          keyVersion: 1,
          deviceId: 'dev-trusted',
          registeredPublicKeySpki: 'pk',
          lastUpdatedAt: '2026-01-01T00:00:00.000Z',
          status: 'succeeded',
          error: null,
          syncState: 'idle',
          pendingSyncFromDeviceId: 'dev-new',
          pendingSyncFromDevicePublicKey: 'spki-new',
          syncCompletedForNewDeviceId: null,
        },
      },
    });

    expect(screen.getByTestId('device-sync-approval-banner')).toBeInTheDocument();
    expect(
      screen.getByText(
        'A new device is requesting access to your message history. Approve to sync encrypted keys.',
        { exact: false },
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
  });

  it('Dismiss clears pending sync in Redux (same outcome as syncDismissed)', async () => {
    const user = userEvent.setup();
    const { store } = renderWithProviders(<DeviceSyncApprovalBanner />, {
      preloadedState: {
        auth: { user: defaultMockUser, accessToken: 't', accessTokenExpiresAt: null },
        crypto: {
          registeredOnServer: true,
          keyVersion: 1,
          deviceId: 'dev-trusted',
          registeredPublicKeySpki: 'pk',
          lastUpdatedAt: '2026-01-01T00:00:00.000Z',
          status: 'succeeded',
          error: null,
          syncState: 'idle',
          pendingSyncFromDeviceId: 'dev-new',
          pendingSyncFromDevicePublicKey: 'spki-new',
          syncCompletedForNewDeviceId: null,
        },
      },
    });

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(store.getState().crypto.pendingSyncFromDeviceId).toBeNull();
    expect(store.getState().crypto.pendingSyncFromDevicePublicKey).toBeNull();
    expect(screen.queryByTestId('device-sync-approval-banner')).not.toBeInTheDocument();
  });

  it('Approve triggers useDeviceKeySync (approveDeviceKeySync with pending payload)', async () => {
    approveDeviceKeySync.mockClear();
    const user = userEvent.setup();
    const payload = {
      newDeviceId: 'dev-new',
      newDevicePublicKey: 'spki-new',
    };

    renderWithProviders(<DeviceSyncApprovalBanner />, {
      preloadedState: {
        auth: { user: defaultMockUser, accessToken: 't', accessTokenExpiresAt: null },
        crypto: {
          registeredOnServer: true,
          keyVersion: 1,
          deviceId: 'dev-trusted',
          registeredPublicKeySpki: 'pk',
          lastUpdatedAt: '2026-01-01T00:00:00.000Z',
          status: 'succeeded',
          error: null,
          syncState: 'idle',
          pendingSyncFromDeviceId: payload.newDeviceId,
          pendingSyncFromDevicePublicKey: payload.newDevicePublicKey,
          syncCompletedForNewDeviceId: null,
        },
      },
    });

    await user.click(screen.getByRole('button', { name: 'Approve' }));

    expect(approveDeviceKeySync).toHaveBeenCalledTimes(1);
    expect(approveDeviceKeySync).toHaveBeenCalledWith(payload);
  });
});
