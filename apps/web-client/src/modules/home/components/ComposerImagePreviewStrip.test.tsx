import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/common/test-utils';
import { ComposerImagePreviewStrip } from './ComposerImagePreviewStrip';

describe('ComposerImagePreviewStrip', () => {
  it('renders nothing when url is null', () => {
    const { container } = renderWithProviders(
      <ComposerImagePreviewStrip url={null} />,
    );
    expect(container.querySelector('img')).toBeNull();
  });

  it('shows a small thumbnail when url is set', () => {
    renderWithProviders(
      <ComposerImagePreviewStrip url="blob:test-blob-url" />,
    );
    expect(screen.getByTestId('composer-image-preview-strip')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /pending attachment preview/i })).toHaveAttribute(
      'src',
      'blob:test-blob-url',
    );
  });
});
