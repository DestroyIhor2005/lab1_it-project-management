import { defineConfig, loadEnv } from 'vite';
import { cwd } from 'node:process';
import react from '@vitejs/plugin-react';

const normalizeHost = (value) => String(value || '').trim().replace(/\/+$/, '');
const normalizeProxyPath = (value, fallback) => {
  const normalizedPath = String(value || fallback || '').trim().replace(/\/+$/, '');
  if (!normalizedPath) {
    return fallback;
  }

  return normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
};

const buildSentryProxy = (dsn) => {
  const normalizedDsn = String(dsn || '').trim();
  if (!normalizedDsn) {
    return null;
  }

  try {
    const parsedDsn = new URL(normalizedDsn);
    const projectId = parsedDsn.pathname.replace(/^\/+/, '').split('/')[0];

    if (!projectId) {
      return null;
    }

    return {
      target: `${parsedDsn.protocol}//${parsedDsn.host}`,
      changeOrigin: true,
      rewrite: () => `/api/${projectId}/envelope/`,
    };
  } catch {
    return null;
  }
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, cwd(), '');
  const posthogProxyPath = normalizeProxyPath(env.VITE_PUBLIC_POSTHOG_PROXY_PATH, '/api/posthog');
  const posthogApiHost = normalizeHost(
    env.VITE_PUBLIC_POSTHOG_API_HOST || env.VITE_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com'
  );
  const sentryProxy = buildSentryProxy(env.VITE_SENTRY_DSN || env.SENTRY_DSN);
  const proxy = {
    '/api/coingecko': {
      target: 'https://api.coingecko.com',
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api\/coingecko/, '/api/v3'),
    },
    '/api/binance': {
      target: 'https://api.binance.com',
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api\/binance/, '/api/v3'),
    },
    [posthogProxyPath]: {
      target: posthogApiHost,
      changeOrigin: true,
      rewrite: (path) => path.slice(posthogProxyPath.length) || '/',
    },
  };

  if (sentryProxy) {
    proxy['/api/sentry'] = sentryProxy;
  }

  return {
    plugins: [react()],
    server: {
      proxy,
    },
    preview: {
      proxy,
    },
  };
});