import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/common/test-utils';
import { ReceiptTicks } from './ReceiptTicks';
import type { ReceiptTickState } from './receiptTickTypes';

describe('ReceiptTicks', () => {
  const states: ReceiptTickState[] = [
    'loading',
    'unknown',
    'sent',
    'delivered',
    'seen',
  ];

  it.each(states)('renders for state %s', (state) => {
    renderWithProviders(<ReceiptTicks state={state} />);
    expect(screen.getByTestId('receipt-ticks')).toBeInTheDocument();
  });

  it('exposes loading as a busy status region', () => {
    renderWithProviders(<ReceiptTicks state="loading" />);

    const el = screen.getByTestId('receipt-ticks');
    expect(el).toHaveAttribute('role', 'status');
    expect(el).toHaveAttribute('aria-busy', 'true');
    expect(el).toHaveAttribute('aria-label', expect.stringMatching(/loading/i));
  });

  it('announces unknown receipt state for assistive tech', () => {
    renderWithProviders(<ReceiptTicks state="unknown" />);

    expect(screen.getByRole('img', { name: /unknown/i })).toBeInTheDocument();
  });

  it('announces sent for assistive tech', () => {
    renderWithProviders(<ReceiptTicks state="sent" />);

    expect(screen.getByRole('img', { name: /^sent$/i })).toBeInTheDocument();
  });

  it('announces delivered for assistive tech', () => {
    renderWithProviders(<ReceiptTicks state="delivered" />);

    expect(screen.getByRole('img', { name: /^delivered$/i })).toBeInTheDocument();
  });

  it('announces seen for assistive tech', () => {
    renderWithProviders(<ReceiptTicks state="seen" />);

    expect(screen.getByRole('img', { name: /^seen$/i })).toBeInTheDocument();
  });

  it('marks decorative tick graphics as hidden from the accessibility tree', () => {
    renderWithProviders(<ReceiptTicks state="delivered" />);

    const svgs = screen.getByTestId('receipt-ticks').querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
    for (const svg of svgs) {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('decorative mode hides the tick region from the accessibility tree (parent supplies status)', () => {
    renderWithProviders(<ReceiptTicks state="sent" decorative />);

    const el = screen.getByTestId('receipt-ticks');
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img', { name: /^sent$/i })).not.toBeInTheDocument();
  });
});
