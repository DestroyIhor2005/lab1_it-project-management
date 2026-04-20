# Observability

## Overview

CryptoTracker currently uses two observability layers:

- Sentry for error tracking, tracing, replay, and alerting
- PostHog for product analytics and interaction events

## Sentry

### Error Monitoring

Sentry is initialized in `src/main.jsx` with the project DSN, environment, and a first-party tunnel path. It captures frontend runtime errors and groups repeated failures into issues.

### User Context

After login or registration, the app sends user context to Sentry in `src/App.jsx`:

- generated user id
- user email
- tags such as `segment` and `auth_mode`

On logout, the app clears the Sentry user context using `Sentry.setUser(null)`.

### Tracing and APM

Tracing is enabled through:

- `Sentry.browserTracingIntegration()`
- `tracesSampleRate`

Current sampling behavior:

- development: `1.0`
- production: `0.1`

This allows the project to analyze:

- page load performance
- Web Vitals
- trace waterfall data
- slow frontend resources and requests

### Session Replay

Replay is enabled through `Sentry.replayIntegration()`.

Current settings:

- `replaysOnErrorSampleRate: 1.0`
- `replaysSessionSampleRate: 0.1`

This makes it possible to inspect sessions connected to errors or traces.

### Alerts

Sentry alert rules can be configured in the Sentry UI to notify about abnormal error spikes.

The current recommended alert pattern for this project is:

- metric: number of errors
- threshold: above 5
- interval: 1 minute
- action: email notification

## PostHog

PostHog is initialized in `src/main.jsx` when the public project token is available. Requests go through the same-origin `/api/posthog` proxy path so the browser does not talk to the cloud endpoint directly.

It is used to capture user interaction events from `src/App.jsx`, including flows related to:

- opening coin details
- marking items as favorites
- removing items from favorites

After authentication the app identifies the current user in PostHog, which keeps feature-flag targeting and person analytics stable across sessions.

## Practical Monitoring Scope

For this project, observability is intended to answer four questions:

1. Did the frontend crash?
2. Which user encountered the problem?
3. Which screen, route, or request was slow?
4. Should the team be notified automatically when errors spike?

This combination gives the project both technical diagnostics and product-level usage visibility.
