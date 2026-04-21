import React from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import posthog from 'posthog-js';
import App from './App.jsx';
import './styles.css';

// Ініціалізація Sentry для моніторингу помилок
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
const appStatus = String(import.meta.env.VITE_APP_STATUS || '').trim();
const appEnv = import.meta.env.VITE_APP_ENV || (appStatus.toLowerCase().includes('production') ? 'production' : 'development');

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: appEnv,
    tunnel: import.meta.env.VITE_SENTRY_TUNNEL_PATH || '/api/sentry',
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    // Записати 100% транзакцій для розробки, у продакшені зменшити до 0.1
    tracesSampleRate: appEnv === 'production' ? 0.1 : 1.0,
    // Записати 100% Session Replay при помилниці
    replaysOnErrorSampleRate: 1.0,
    // Записати 10% Session Replay для інших сесій
    replaysSessionSampleRate: appEnv === 'production' ? 0.1 : 0.1,
  });
}

const projectApiKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
const apiHost = import.meta.env.VITE_PUBLIC_POSTHOG_PROXY_PATH || '/api/posthog';

if (projectApiKey) {
  posthog.init(projectApiKey, {
    api_host: apiHost,
    person_profiles: 'identified_only',
    capture_pageview: true,
    autocapture: true,
  });
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
