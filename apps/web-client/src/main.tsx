import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';
import './index.css';
import { attachHttpAuth } from './api/httpClient';
import { swrConfigValue } from './api/swrConfig';
import App from './App';
import { SessionRestore } from './features/auth/SessionRestore';
import { store } from './store';

attachHttpAuth(store);
import { ThemeProvider } from './theme/ThemeProvider';

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
            <SessionRestore>
              <App />
            </SessionRestore>
          </ThemeProvider>
        </SWRConfig>
      </Provider>
    </BrowserRouter>
  </StrictMode>,
);
