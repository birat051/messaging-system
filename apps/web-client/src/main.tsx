import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';
import './index.css';
import { attachHttpAuth } from './common/api/httpClient';
import { swrConfigValue } from './common/api/swrConfig';
import { ThemeProvider } from './common/theme/ThemeProvider';
import App from './App';
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
            <SessionRestore>
              <App />
            </SessionRestore>
          </ThemeProvider>
        </SWRConfig>
      </Provider>
    </BrowserRouter>
  </StrictMode>,
);
