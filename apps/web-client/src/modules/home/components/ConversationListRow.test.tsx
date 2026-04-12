import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/common/test-utils';
import { ConversationListRow } from './ConversationListRow';

describe('ConversationListRow', () => {
  it('renders title and optional subtitle', () => {
    renderWithProviders(
      <ConversationListRow title="Ada" subtitle="Last message preview" />,
    );

    expect(screen.getByRole('button', { name: /ada/i })).toBeInTheDocument();
    expect(screen.getByText('Last message preview')).toBeInTheDocument();
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
