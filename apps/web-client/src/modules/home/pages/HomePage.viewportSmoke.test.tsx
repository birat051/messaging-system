import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SWRConfig } from 'swr';
import { describe, expect, it, vi } from 'vitest';
import type { components } from '@/generated/api-types';
import { ToastProvider } from '@/common/components/toast/ToastProvider';
import { defaultMockUser } from '@/common/mocks/handlers';
import { server } from '@/common/mocks/server';
import { ThemeProvider } from '@/common/theme/ThemeProvider';
import { createTestStore } from '@/common/test-utils';
import { HomePage } from './HomePage';

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

/** Representative widths from **`TASK_CHECKLIST.md`** (phone / tablet / desktop). */
const VIEWPORTS: ReadonlyArray<{ width: number; height: number; label: string }> = [
  { width: 390, height: 844, label: 'phone ~390' },
  { width: 768, height: 1024, label: 'tablet ~768' },
  { width: 1280, height: 800, label: 'desktop 1024+' },
];

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', {
    value: width,
    configurable: true,
  });
  Object.defineProperty(window, 'innerHeight', {
    value: height,
    configurable: true,
  });
  window.dispatchEvent(new Event('resize'));
}

function renderHomeInViewport(width: number, height: number) {
  setViewport(width, height);
  const store = createTestStore({
    auth: {
      user: { ...defaultMockUser, emailVerified: true },
      accessToken: 'test-token',
    },
  });

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/']}>
        <div
          data-testid="viewport-root"
          style={{
            width: `${width}px`,
            height: `${height}px`,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minHeight: 0,
          }}
        >
          <ThemeProvider>
            <ToastProvider>
              <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                </Routes>
              </SWRConfig>
            </ToastProvider>
          </ThemeProvider>
        </div>
      </MemoryRouter>
    </Provider>,
  );
}

describe('HomePage viewport smoke (outer shell overflow)', () => {
  it.each(VIEWPORTS)(
    'does not grow the outer shell past the viewport ($label)',
    async ({ width, height, label }) => {
      server.use(
        http.get('*/v1/conversations', () =>
          HttpResponse.json({
            items: [],
            nextCursor: null,
            hasMore: false,
          }),
        ),
      );

      renderHomeInViewport(width, height);

      await waitFor(() => {
        expect(screen.getByTestId('home-conversation-shell')).toBeInTheDocument();
      });

      const viewportRoot = screen.getByTestId('viewport-root');
      const pageShell = screen.getByTestId('home-page-shell');

      const slackPx = 2;
      expect(
        viewportRoot.scrollHeight,
        `${label}: viewport-root scrollHeight (${viewportRoot.scrollHeight}) should not exceed clientHeight (${viewportRoot.clientHeight})`,
      ).toBeLessThanOrEqual(viewportRoot.clientHeight + slackPx);
      expect(
        pageShell.scrollHeight,
        `${label}: home-page-shell scrollHeight (${pageShell.scrollHeight}) should not exceed clientHeight (${pageShell.clientHeight})`,
      ).toBeLessThanOrEqual(pageShell.clientHeight + slackPx);
    },
  );
});
