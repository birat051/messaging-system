import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/common/test-utils';
import { ThreadMessageMedia } from './ThreadMessageMedia';

describe('ThreadMessageMedia', () => {
  it('shows text fallback when public URL env is not configured', () => {
    vi.stubEnv('VITE_S3_PUBLIC_BASE_URL', '');
    vi.stubEnv('VITE_S3_BUCKET', '');
    try {
      renderWithProviders(
        <ThreadMessageMedia
          mediaKey="users/1/a.png"
          messageId="m1"
          isOwn
        />,
      );
      expect(screen.getByText('Attachment')).toBeInTheDocument();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('renders a lazy image with descriptive alt when URL is configured', () => {
    vi.stubEnv('VITE_S3_PUBLIC_BASE_URL', 'http://localhost:9000');
    vi.stubEnv('VITE_S3_BUCKET', 'messaging-media');
    try {
      renderWithProviders(
        <ThreadMessageMedia
          mediaKey="users/1/photo.png"
          messageId="m2"
          isOwn={false}
        />,
      );
      const img = screen.getByRole('img', {
        name: /image attachment from the other person/i,
      });
      expect(img).toHaveAttribute('loading', 'lazy');
      expect(img).toHaveAttribute('decoding', 'async');
      expect(img.getAttribute('src')).toContain('photo.png');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('renders open-attachment link for non-image keys when URL is configured', () => {
    vi.stubEnv('VITE_S3_PUBLIC_BASE_URL', 'http://localhost:9000');
    vi.stubEnv('VITE_S3_BUCKET', 'messaging-media');
    try {
      renderWithProviders(
        <ThreadMessageMedia
          mediaKey="users/1/doc.pdf"
          messageId="m3"
          isOwn
        />,
      );
      const link = screen.getByRole('link', { name: /open attachment/i });
      expect(link.getAttribute('href')).toContain('doc.pdf');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
