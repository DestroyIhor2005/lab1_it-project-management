import { defineConfig, loadEnv } from 'vite';
import { cwd } from 'node:process';
import react from '@vitejs/plugin-react';

const normalizeHost = (value) => String(value || '').trim().replace(/\/+$/, '');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, cwd(), '');
  const posthogProxyPath = normalizeHost(env.VITE_PUBLIC_POSTHOG_PROXY_PATH);
  const posthogApiHost = normalizeHost(env.VITE_PUBLIC_POSTHOG_API_HOST || env.VITE_PUBLIC_POSTHOG_HOST);
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
  };

  if (posthogProxyPath && posthogApiHost) {
    proxy[posthogProxyPath] = {
      target: posthogApiHost,
      changeOrigin: true,
      rewrite: (path) => path.replace(new RegExp(`^${posthogProxyPath}`), ''),
    };
  }

  return {
    plugins: [react()],
    server: {
      proxy,
    },
  };
});