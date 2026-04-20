# Integrations

## External Data Providers

### CoinGecko

CoinGecko is used for:

- top market coins
- search suggestions
- coin metadata
- selected market snapshots

Development requests go through the Vite proxy path:

- `/api/coingecko`

In development this proxy is rewritten to:

- `https://api.coingecko.com/api/v3`

### Binance

Binance is used for:

- live ticker updates
- klines for chart rendering
- order book data

Development requests go through:

- `/api/binance`

In development this proxy is rewritten to:

- `https://api.binance.com/api/v3`

The app also uses Binance WebSocket streams for real-time updates.

## Observability

### PostHog

PostHog is initialized in `src/main.jsx` when the public project token is available. Browser requests go through the first-party proxy path `/api/posthog`, which Vercel forwards to PostHog.

It is used to capture user interaction events such as:

- opening coin details
- adding favorites
- removing favorites

After authentication, the app calls `posthog.identify(...)` and reloads feature flags so user-scoped targeting stays stable. On logout it resets the analytics identity.

Environment variables:

- `VITE_PUBLIC_POSTHOG_KEY`
- `VITE_PUBLIC_POSTHOG_API_HOST`
- `VITE_PUBLIC_POSTHOG_PROXY_PATH`

### Sentry

Sentry is initialized in `src/main.jsx` and uses the tunnel path `/api/sentry`, which Vercel forwards to the Sentry ingest endpoint.

It provides:

- error monitoring
- tracing and APM
- session replay
- alerting support through Sentry UI

The test button in `src/App.jsx` now calls `Sentry.captureException(...)` so production captures do not depend on a browser rethrow.

Environment variables:

- `VITE_SENTRY_DSN`
- `VITE_APP_ENV`
- `VITE_SENTRY_TUNNEL_PATH`

User context is assigned in `src/App.jsx` after login or registration.

## Development Proxy

Vite proxy configuration lives in `vite.config.js`.

Current proxy mappings:

- `/api/coingecko` -> CoinGecko API v3
- `/api/binance` -> Binance API v3
- `/api/posthog` -> PostHog ingest endpoint
- `/api/sentry` -> Sentry tunnel endpoint during local development

This avoids calling external public APIs directly from browser component code during local development.

## Deployment Platform

### Vercel

The project is deployed to Vercel for production hosting.

Production URL:

- `https://crypto-tracker-pi-two.vercel.app/`
