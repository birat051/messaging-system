import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/common/test-utils';
import { ThreadMessageMedia } from './ThreadMessageMedia';

describe('ThreadMessageMedia', () => {
  it('uses previewUrlOverride when public URL env is not configured', () => {
    vi.stubEnv('VITE_S3_PUBLIC_BASE_URL', '');
    vi.stubEnv('VITE_S3_BUCKET', '');
    try {
      renderWithProviders(
        <ThreadMessageMedia
          mediaKey="users/1/a.png"
          messageId="m-blob"
          isOwn
          previewUrlOverride="blob:local-preview"
        />,
      );
      const img = screen.getByRole('img', {
        name: /image attachment you sent/i,
      });
      expect(img).toHaveAttribute('src', 'blob:local-preview');
    } finally {
      vi.unstubAllEnvs();
    }
  });

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

  it('opens an optional lightbox dialog and closes from the Close control', async () => {
    const user = userEvent.setup();
    vi.stubEnv('VITE_S3_PUBLIC_BASE_URL', 'http://localhost:9000');
    vi.stubEnv('VITE_S3_BUCKET', 'messaging-media');
    try {
      renderWithProviders(
        <ThreadMessageMedia
          mediaKey="users/1/photo.png"
          messageId="m-lb"
          isOwn
        />,
      );
      await user.click(
        screen.getByRole('button', { name: /image attachment you sent/i }),
      );
      expect(
        screen.getByRole('dialog', { name: /image preview/i }),
      ).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /^close$/i }));
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('renders only an inline img when lightbox is disabled', () => {
    vi.stubEnv('VITE_S3_PUBLIC_BASE_URL', 'http://localhost:9000');
    vi.stubEnv('VITE_S3_BUCKET', 'messaging-media');
    try {
      renderWithProviders(
        <ThreadMessageMedia
          mediaKey="users/1/photo.png"
          messageId="m-nolb"
          isOwn={false}
          lightboxEnabled={false}
        />,
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      const img = screen.getByRole('img', {
        name: /image attachment from the other person/i,
      });
      expect(img).toHaveAttribute('loading', 'lazy');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('retries with cache-bust then VITE public URL when preview URL fails', () => {
    vi.stubEnv('VITE_S3_PUBLIC_BASE_URL', 'http://localhost:9000');
    vi.stubEnv('VITE_S3_BUCKET', 'messaging-media');
    try {
      renderWithProviders(
        <ThreadMessageMedia
          mediaKey="users/1/photo.png"
          messageId="m-fb"
          isOwn={false}
          previewUrlOverride="https://cdn.other.example/photo.png"
          lightboxEnabled={false}
        />,
      );
      const img = screen.getByRole('img', {
        name: /image attachment from the other person/i,
      });
      const expectedFallback =
        'http://localhost:9000/messaging-media/users/1/photo.png';
      fireEvent.error(img);
      expect(img.getAttribute('src')).toMatch(/\?_ekko_cb=\d+$/);
      fireEvent.error(img);
      expect(img).toHaveAttribute('src', expectedFallback);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('skips cache-bust for query URLs and tries fallback in one error', () => {
    vi.stubEnv('VITE_S3_PUBLIC_BASE_URL', 'http://localhost:9000');
    vi.stubEnv('VITE_S3_BUCKET', 'messaging-media');
    try {
      renderWithProviders(
        <ThreadMessageMedia
          mediaKey="users/1/photo.png"
          messageId="m-pre"
          isOwn={false}
          previewUrlOverride="https://signed.example/o.png?token=abc"
          lightboxEnabled={false}
        />,
      );
      const img = screen.getByRole('img', {
        name: /image attachment from the other person/i,
      });
      fireEvent.error(img);
      expect(img).toHaveAttribute(
        'src',
        'http://localhost:9000/messaging-media/users/1/photo.png',
      );
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
