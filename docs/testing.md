# Testing

## Test Types

The project currently uses two testing layers:

- unit tests for API and helper behavior
- end-to-end tests for UI flows

## Unit Tests

Unit tests are located in:

- `src/api.test.js`

Run them with:

```bash
npm run test:unit
```

Coverage command:

```bash
npm run test:unit:coverage
```

These tests validate behaviors such as:

- search result filtering
- duplicate symbol handling
- mocked API price resolution
- utility calculations and validation helpers

## End-to-End Tests

Playwright tests are located in:

- `tests/app.spec.js`

Run them with:

```bash
npm run test:e2e
```

UI mode:

```bash
npm run test:e2e:ui
```

The Playwright suite mocks the proxied external endpoints and validates flows such as:

- initial top coin rendering
- search suggestions
- opening a coin chart
- favorites interactions
- pricing and volume visibility

## Full Test Run

```bash
npm run test
```

This executes unit and e2e checks sequentially.

## Testing Notes

- E2E mocks intercept proxied paths rather than direct third-party URLs.
- In this workspace, PowerShell execution policy may block some `npm` wrapper behavior. If needed, tests can be run through `node` or `.cmd` binaries.
- Generated folders like `coverage`, `playwright-report`, and `test-results` should be treated as output artifacts, not source documentation.
