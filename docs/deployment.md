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
- `VITE_APP_ENV` — application environment passed to Sentry

### PostHog Variables

- `VITE_PUBLIC_POSTHOG_KEY`
- `VITE_PUBLIC_POSTHOG_API_HOST`
- optional `VITE_PUBLIC_POSTHOG_PROXY_PATH`

### Sentry Variables

- `VITE_SENTRY_DSN`
- `VITE_APP_ENV`

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
- PostHog key and API host are set for production
