import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewDirectThreadComposer } from './NewDirectThreadComposer';
import { renderWithProviders, type PreloadedRootState } from '@/common/test-utils';
import type { components } from '@/generated/api-types';

type UserSearchResult = components['schemas']['UserSearchResult'];

const sendMessageMock = vi.hoisted(() =>
  vi.fn().mockRejectedValue(new Error('Guests can only message other guests')),
);

vi.mock('@/common/hooks/useComposerMediaAttachment', () => ({
  useComposerMediaAttachment: () => ({
    fileInputRef: { current: null },
    fileName: null,
    imagePreviewUrl: null,
    mediaPreviewUrl: null,
    mediaRetrievableUrl: null,
    openFilePicker: vi.fn(),
    onFileInputChange: vi.fn(),
    clearAttachment: vi.fn(),
    mediaKey: null,
    isUploading: false,
    progress: 0,
    error: null,
    cancelUpload: vi.fn(),
    retryUpload: vi.fn(),
  }),
}));

vi.mock('@/common/hooks/useSendEncryptedMessage', () => ({
  useSendEncryptedMessage: () => ({
    sendMessage: sendMessageMock,
  }),
}));

const registeredRecipient: UserSearchResult = {
  userId: 'reg-peer-1',
  username: 'registered_peer',
  displayName: 'Registered Peer',
  profilePicture: null,
  conversationId: null,
  guest: false,
};

const guestPreload: PreloadedRootState = {
  auth: {
    user: {
      id: 'guest-sender',
      email: null,
      username: 'guest_me',
      displayName: null,
      emailVerified: false,
      profilePicture: null,
      status: null,
      guest: true,
    },
    accessToken: 'guest-at',
    accessTokenExpiresAt: null,
  },
};

describe('NewDirectThreadComposer', () => {
  it('shows server error when guest cannot message a registered user, plus register hint', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <NewDirectThreadComposer
        recipient={registeredRecipient}
        onConversationIdStored={vi.fn()}
      />,
      { preloadedState: guestPreload, route: '/' },
    );

    await user.type(screen.getByRole('textbox'), 'hi');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: 'reg-peer-1',
        body: 'hi',
      }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/guests can only message other guests/i);
    const registerLink = screen.getByRole('link', { name: /^register$/i });
    expect(registerLink).toHaveAttribute('href', '/register?from=guest');
  });
});
