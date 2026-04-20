[![CI/CD Pipeline](https://github.com/DestroyIhor2005/lab1_it-project-management/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/DestroyIhor2005/lab1_it-project-management/actions/workflows/ci-cd.yml)

# CryptoTracker

Фронтенд-застосунок для моніторингу криптовалют у реальному часі. Проєкт створений на React + Vite та використовується в лабораторній роботі з управління ІТ-проєктами, CI/CD і продуктово-аналітичної інтеграції.

## Про проєкт

Ідея MVP: створити простий і швидкий інтерфейс для моніторингу вартості криптоактивів, пошуку монет, перегляду ринкових даних і графіків у реальному часі через публічні API.

## Production URL

Live application: https://crypto-tracker-pi-two.vercel.app/

## Можливості

- перегляд топ-10 монет за 24h обсягом
- пошук монет за назвою або тікером
- відкриття сторінки монети з графіком, стаканом і ринковими даними
- збереження обраних монет у локальному сховищі браузера, окремо для гостьової сесії або залогіненого акаунта
- інтеграція PostHog через first-party proxy `/api/posthog`
- інтеграція Sentry через tunnel `/api/sentry` для error tracking, tracing, replay та alerting

## Технології

- React
- Vite
- ESLint
- Node test runner
- Playwright
- GitHub Actions
- Vercel
- CoinGecko API
- Binance API
- PostHog
- Sentry

## Структура проєкту

- `src/` — вихідний код застосунку
- `tests/` — e2e тести Playwright
- `.github/workflows/` — CI/CD workflow для GitHub Actions
- `docs/` — проектна документація по архітектурі, інтеграціях, деплою, тестуванню та observability

## Документація

У папці `docs/` зібрано окремі документи по ключових частинах проєкту:

- `docs/architecture.md` — архітектура застосунку та структура модулів
- `docs/integrations.md` — зовнішні API та внутрішні інтеграції
- `docs/deployment.md` — локальний запуск, збірка та деплой
- `docs/testing.md` — unit та e2e тестування
- `docs/observability.md` — Sentry, PostHog, tracing і alerting

## Локальний запуск

```bash
npm install
npm run dev
```

## Основні команди

```bash
npm run lint
npm run test:unit
npm run test:e2e
npm run build
```

## Змінні оточення

У корені проєкту є два файли:

- `.env` — для режиму розробки
- `.env.production` — для продакшену

Основні змінні:

- `VITE_APP_STATUS` — показується в інтерфейсі
- `VITE_APP_ENV` — середовище застосунку для Sentry; якщо відсутнє, використовується `VITE_APP_STATUS`
- `VITE_PUBLIC_POSTHOG_KEY` — project token PostHog
- `VITE_PUBLIC_POSTHOG_PROXY_PATH` — client path для proxy PostHog, за замовчуванням `/api/posthog`
- `VITE_PUBLIC_POSTHOG_API_HOST` — ingest host PostHog для proxy
- `VITE_SENTRY_DSN` — DSN ключ Sentry для error tracking і tracing
- `VITE_SENTRY_TUNNEL_PATH` — client path для Sentry tunnel, за замовчуванням `/api/sentry`

Перевірка:

- `npm run dev` — у UI має відображатися локальний режим
- `npm run build && npm run preview` — має підтягуватись production-конфіг і same-origin proxy paths

## CI/CD

У репозиторії налаштовано workflow `CI/CD Pipeline`, який виконує:

- встановлення залежностей
- перевірку ESLint
- запуск unit tests
- збірку проєкту
- завантаження `dist` як artifact

Продакшн-деплой виконується через Vercel.