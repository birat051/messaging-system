import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/common/test-utils';
import { ConversationListRow } from './ConversationListRow';

describe('ConversationListRow', () => {
  it('renders avatar initials, title, and optional subtitle', () => {
    renderWithProviders(
      <ConversationListRow title="Ada" subtitle="Last message preview" />,
    );

    const row = screen.getByRole('button', { name: /ada/i });
    expect(row).toBeInTheDocument();
    expect(row).toHaveClass('min-h-11', 'touch-manipulation');
    expect(screen.getByText('AD')).toBeInTheDocument();
    expect(screen.getByText('Last message preview')).toBeInTheDocument();
  });

  it('uses explicit avatarInitials when provided', () => {
    renderWithProviders(
      <ConversationListRow title="Ada" avatarInitials="A1" subtitle="Hi" />,
    );
    expect(screen.getByText('A1')).toBeInTheDocument();
  });

  it('calls onSelect when the row is activated', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    renderWithProviders(
      <ConversationListRow title="Bob" onSelect={onSelect} />,
    );

    await user.click(screen.getByRole('button', { name: /bob/i }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('renders optional presence line (online vs stale styling)', () => {
    const { rerender } = renderWithProviders(
      <ConversationListRow
        title="Ada"
        subtitle="Hey there"
        presence={{ text: 'Online', variant: 'online' }}
      />,
    );

    expect(screen.getByText('Online')).toHaveClass('text-emerald-600');
    rerender(
      <ConversationListRow
        title="Ada"
        subtitle="Hey there"
        presence={{ text: 'Last seen 2h ago', variant: 'stale' }}
      />,
    );
    expect(screen.getByText('Last seen 2h ago')).toHaveClass(
      'text-muted-foreground',
    );
  });

  it('marks the active conversation with aria-pressed', () => {
    const { rerender } = renderWithProviders(
      <ConversationListRow title="Casey" isActive={false} />,
    );

    expect(screen.getByRole('button', { name: /casey/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    rerender(
      <ConversationListRow title="Casey" isActive />,
    );

    expect(screen.getByRole('button', { name: /casey/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
