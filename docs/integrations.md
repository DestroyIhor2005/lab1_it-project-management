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

PostHog is initialized in `src/main.jsx` when the required Vite variables are present. It is used to capture user interaction events such as:

- opening coin details
- adding favorites
- removing favorites

Environment variables:

- `VITE_PUBLIC_POSTHOG_KEY`
- `VITE_PUBLIC_POSTHOG_API_HOST`

### Sentry

Sentry is initialized in `src/main.jsx` and currently provides:

- error monitoring
- tracing and APM
- session replay
- alerting support through Sentry UI

Environment variables:

- `VITE_SENTRY_DSN`
- `VITE_APP_ENV`

User context is assigned in `src/App.jsx` after login or registration.

## Development Proxy

Vite proxy configuration lives in `vite.config.js`.

Current proxy mappings:

- `/api/coingecko` -> CoinGecko API v3
- `/api/binance` -> Binance API v3

This avoids calling external public APIs directly from browser component code during local development.

## Deployment Platform

### Vercel

The project is deployed to Vercel for production hosting.

Production URL:

- `https://crypto-tracker-pi-two.vercel.app/`
