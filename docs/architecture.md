# Architecture

## Overview

CryptoTracker is a frontend application for monitoring cryptocurrency market data in real time. The project is built with React and Vite and focuses on three main usage flows:

- viewing the top market coins by 24h volume
- searching and opening a specific coin
- analyzing live chart and order book data for a selected asset

The application is client-side only. External data is requested from public APIs through local Vite proxy endpoints.

## Main Modules

### App Shell

The main application logic lives in `src/App.jsx`. This file is responsible for:

- application state management
- search flow
- chart page rendering
- favorites and watchlist persistence
- Sentry user context and test error flow
- PostHog event capture for user actions

### Application Bootstrap

`src/main.jsx` initializes:

- React rendering
- Sentry error tracking, replay, and tracing
- PostHog analytics

This file is the main entry point of the application lifecycle.

### API Layer

`src/api.js` contains helper functions for all external requests and data normalization. It handles:

- CoinGecko market and search data
- Binance market data, klines, and order book
- local cache helpers
- websocket subscription helpers for live updates

## UI Structure

The UI is split into several functional areas:

- header with environment, stream state, current user, and logout/login controls
- authentication modal for login/registration flow used for Sentry user context
- market overview list with top 10 assets
- search input with live suggestions
- favorites list
- detailed trade page with chart and order book

## Data Flow

1. The app starts in `src/main.jsx`.
2. Sentry and PostHog are initialized.
3. `App.jsx` loads cached user data and market data.
4. Requests are sent to local proxy paths.
5. `src/api.js` transforms raw API responses into UI-friendly objects.
6. React state updates the interface.
7. WebSocket updates from Binance refresh visible market values in near real time.

## Persistence

The app uses `localStorage` for lightweight client persistence:

- watchlist
- favorites
- cached top 10 market data
- cached search results
- cached coin directory

This keeps the UI responsive between refreshes and reduces repeated calls for some flows.

## Runtime Notes

- CoinGecko and Binance are never called directly from component code; requests go through `src/api.js`.
- External URLs are proxied via Vite in development using `/api/coingecko` and `/api/binance`.
- Performance and error telemetry are sent to Sentry when the required environment variables are configured.
