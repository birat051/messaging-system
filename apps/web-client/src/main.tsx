import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';
import './index.css';
import { attachHttpAuth } from './common/api/httpClient';
import { swrConfigValue } from './common/api/swrConfig';
import { ToastProvider } from './common/components/toast/ToastProvider';
import { DeviceSyncBlockingGate } from './common/components/DeviceSyncBlockingGate';
import { ThemeProvider } from './common/theme/ThemeProvider';
import App from './App';
import { SocketWorkerProvider } from './common/realtime/SocketWorkerProvider';
import { SessionRestore } from './modules/auth/components/SessionRestore';
import { store } from './store';

attachHttpAuth(store);

const root = document.getElementById('root');
if (!root) {
  throw new Error('root element not found');
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <Provider store={store}>
        <SWRConfig value={swrConfigValue}>
          <ThemeProvider>
            <ToastProvider>
              <SessionRestore>
                <SocketWorkerProvider>
                  <DeviceSyncBlockingGate>
                    <App />
                  </DeviceSyncBlockingGate>
                </SocketWorkerProvider>
              </SessionRestore>
            </ToastProvider>
          </ThemeProvider>
        </SWRConfig>
      </Provider>
    </BrowserRouter>
  </StrictMode>,
);
