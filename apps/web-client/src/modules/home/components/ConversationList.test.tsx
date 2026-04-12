import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/common/test-utils';
import { ConversationList } from './ConversationList';

describe('ConversationList', () => {
  it('shows an empty status when there are no conversations and not loading', () => {
    renderWithProviders(
      <ConversationList items={[]} emptyLabel="Nothing here yet" />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Nothing here yet');
  });

  it('shows loading when fetching and the list is still empty', () => {
    renderWithProviders(<ConversationList items={[]} isLoading />);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveTextContent(/loading conversations/i);
  });

  it('shows an error alert when errorMessage is set', () => {
    renderWithProviders(
      <ConversationList
        items={[{ id: '1', title: 'A' }]}
        errorMessage="Could not load conversations"
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not load conversations',
    );
    expect(screen.queryByRole('button', { name: /a/i })).not.toBeInTheDocument();
  });

  it('renders rows when items exist and forwards selection', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    renderWithProviders(
      <ConversationList
        items={[
          { id: 'c1', title: 'Ada', subtitle: 'Hey' },
          { id: 'c2', title: 'Bob' },
        ]}
        selectedId="c1"
        onSelect={onSelect}
      />,
    );

    expect(screen.getByRole('button', { name: /ada/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: /bob/i }));
    expect(onSelect).toHaveBeenCalledWith('c2');
  });
});
