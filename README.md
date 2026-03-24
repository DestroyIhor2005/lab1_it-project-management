[![CI/CD Pipeline](https://github.com/DestroyIhor2005/lab1_it-project-management/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/DestroyIhor2005/lab1_it-project-management/actions/workflows/ci-cd.yml)

# CryptoTracker

Фронтенд-застосунок для моніторингу криптовалют у реальному часі. Проєкт створений на React + Vite та використовується в лабораторній роботі з налаштування CI/CD через GitHub Actions і Vercel.

## Production URL

Live application: https://crypto-tracker-pi-two.vercel.app/

## Можливості

- перегляд топ-10 монет за 24h обсягом
- пошук монет за назвою або тікером
- відкриття сторінки монети з графіком, стаканом і ринковими даними
- збереження обраних монет у локальному сховищі браузера

## Технології

- React
- Vite
- ESLint
- Vitest / Node test runner
- Playwright
- GitHub Actions
- Vercel
- CoinGecko API
- Binance API

## Структура проєкту

- `src/` — вихідний код застосунку
- `tests/` — e2e тести Playwright
- `.github/workflows/` — CI/CD workflow для GitHub Actions
- `docs/` — документація і матеріали до лабораторної

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

## CI/CD

У репозиторії налаштовано workflow `CI/CD Pipeline`, який виконує:

- встановлення залежностей
- перевірку ESLint
- запуск unit tests
- збірку проєкту

Продакшн-деплой виконується через Vercel.

## Призначення README

Цей файл оновлено в межах лабораторної роботи для актуалізації опису проєкту та повторного запуску GitHub Actions status check.

