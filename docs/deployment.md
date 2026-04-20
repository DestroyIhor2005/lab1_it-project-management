# Deployment

## Local Development

### Requirements

- Node.js
- npm

### Install Dependencies

```bash
npm install
```

### Start Development Server

```bash
npm run dev
```

The application runs with Vite and uses local proxy routes for external APIs.

The same-origin observability routes are also available during local development and preview:

- `/api/posthog` for PostHog capture and feature flags
- `/api/sentry` for the Sentry tunnel

## Build

### Production Build

```bash
npm run build
```

### Preview Production Build Locally

```bash
npm run preview
```

## Environment Variables

The project relies on Vite environment variables.

### Core UI Variables

- `VITE_APP_STATUS` — environment label shown in UI
- `VITE_APP_ENV` — application environment passed to Sentry; falls back to `VITE_APP_STATUS`

### PostHog Variables

- `VITE_PUBLIC_POSTHOG_KEY`
- `VITE_PUBLIC_POSTHOG_PROXY_PATH` — defaults to `/api/posthog`
- `VITE_PUBLIC_POSTHOG_API_HOST`

### Sentry Variables

- `VITE_SENTRY_DSN`
- `VITE_SENTRY_TUNNEL_PATH` — defaults to `/api/sentry`

## CI/CD

The repository includes a GitHub Actions workflow that runs:

- dependency installation
- linting
- unit tests
- build

Generated build artifacts can then be deployed by the configured hosting flow.

## Hosting

Production deployment is handled with Vercel.

When preparing production deployment, verify:

- environment variables are configured in Vercel
- Sentry DSN points to the correct project
- PostHog key is set and the proxy path is routed through Vercel
- Sentry tunnel path is routed through Vercel
