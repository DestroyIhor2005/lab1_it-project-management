import { test, expect } from '@playwright/test';

const topCoins = [
  { id: 'bitcoin', symbol: 'BTC', current_price: 65000, price_change_percentage_24h: 2.5, total_volume: 51000000000 },
  { id: 'ethereum', symbol: 'ETH', current_price: 3200, price_change_percentage_24h: -1.2, total_volume: 27000000000 },
  { id: 'solana', symbol: 'SOL', current_price: 145, price_change_percentage_24h: 4.1, total_volume: 8900000000 },
  { id: 'bnb', symbol: 'BNB', current_price: 590, price_change_percentage_24h: 1.1, total_volume: 4100000000 },
  { id: 'ripple', symbol: 'XRP', current_price: 0.62, price_change_percentage_24h: -0.8, total_volume: 3200000000 },
  { id: 'cardano', symbol: 'ADA', current_price: 0.71, price_change_percentage_24h: 0.5, total_volume: 2100000000 },
  { id: 'dogecoin', symbol: 'DOGE', current_price: 0.18, price_change_percentage_24h: 3.2, total_volume: 1800000000 },
  { id: 'tron', symbol: 'TRX', current_price: 0.12, price_change_percentage_24h: 0.9, total_volume: 1400000000 },
  { id: 'toncoin', symbol: 'TON', current_price: 5.8, price_change_percentage_24h: -2.1, total_volume: 1200000000 },
  { id: 'avalanche-2', symbol: 'AVAX', current_price: 39, price_change_percentage_24h: 1.7, total_volume: 1100000000 },
];

const searchResults = {
  SOL: [{ id: 'solana', name: 'Solana', symbol: 'sol', large: 'https://example.com/sol.png' }],
  ADA: [{ id: 'cardano', name: 'Cardano', symbol: 'ada', large: 'https://example.com/ada.png' }],
  GOLD: [
    { id: 'tether-gold', name: 'Tether Gold', symbol: 'xaut', large: 'https://example.com/xaut.png', market_cap_rank: 34 },
    { id: 'gold', name: 'Gold', symbol: 'gold', large: 'https://example.com/gold.png', market_cap_rank: 1950 },
  ],
  BTC: [
    { id: 'bitcoin', name: 'Bitcoin', symbol: 'btc', large: 'https://example.com/btc.png', market_cap_rank: 1 },
    { id: 'wrapped-bitcoin', name: 'Wrapped Bitcoin', symbol: 'wbtc', large: 'https://example.com/wbtc.png', market_cap_rank: 18 },
  ],
};

const priceDetails = {
  bitcoin: { usd: 65000, usd_24h_change: 2.5, usd_24h_vol: 51000000000, usd_market_cap: 1200000000000 },
  ethereum: { usd: 3200, usd_24h_change: -1.2, usd_24h_vol: 27000000000, usd_market_cap: 380000000000 },
  solana: { usd: 145, usd_24h_change: 4.1, usd_24h_vol: 8900000000, usd_market_cap: 64000000000 },
  cardano: { usd: 0.71, usd_24h_change: 0.5, usd_24h_vol: 2100000000, usd_market_cap: 25000000000 },
  'tether-gold': { usd: 3340, usd_24h_change: 0.4, usd_24h_vol: 12500000, usd_market_cap: 823000000 },
  gold: { usd: 0.000023, usd_24h_change: 0, usd_24h_vol: 0.93, usd_market_cap: 0 },
  'wrapped-bitcoin': { usd: 64980, usd_24h_change: 2.4, usd_24h_vol: 320000000, usd_market_cap: 10500000000 },
};

const marketCoinsById = {
  bitcoin: { id: 'bitcoin', name: 'Bitcoin', symbol: 'btc', image: 'https://example.com/btc.png', current_price: 65000, price_change_percentage_24h: 2.5, total_volume: 51000000000, market_cap: 1280000000000, market_cap_rank: 1 },
  ethereum: { id: 'ethereum', name: 'Ethereum', symbol: 'eth', image: 'https://example.com/eth.png', current_price: 3200, price_change_percentage_24h: -1.2, total_volume: 27000000000, market_cap: 380000000000, market_cap_rank: 2 },
  solana: { id: 'solana', name: 'Solana', symbol: 'sol', image: 'https://example.com/sol.png', current_price: 145, price_change_percentage_24h: 4.1, total_volume: 8900000000, market_cap: 64000000000, market_cap_rank: 5 },
  bnb: { id: 'bnb', name: 'BNB', symbol: 'bnb', image: 'https://example.com/bnb.png', current_price: 590, price_change_percentage_24h: 1.1, total_volume: 4100000000, market_cap: 90000000000, market_cap_rank: 4 },
  ripple: { id: 'ripple', name: 'XRP', symbol: 'xrp', image: 'https://example.com/xrp.png', current_price: 0.62, price_change_percentage_24h: -0.8, total_volume: 3200000000, market_cap: 30000000000, market_cap_rank: 6 },
  cardano: { id: 'cardano', name: 'Cardano', symbol: 'ada', image: 'https://example.com/ada.png', current_price: 0.71, price_change_percentage_24h: 0.5, total_volume: 2100000000, market_cap: 25000000000, market_cap_rank: 13 },
  dogecoin: { id: 'dogecoin', name: 'Dogecoin', symbol: 'doge', image: 'https://example.com/doge.png', current_price: 0.18, price_change_percentage_24h: 3.2, total_volume: 1800000000, market_cap: 20000000000, market_cap_rank: 8 },
  tron: { id: 'tron', name: 'TRON', symbol: 'trx', image: 'https://example.com/trx.png', current_price: 0.12, price_change_percentage_24h: 0.9, total_volume: 1400000000, market_cap: 11000000000, market_cap_rank: 10 },
  toncoin: { id: 'toncoin', name: 'Toncoin', symbol: 'ton', image: 'https://example.com/ton.png', current_price: 5.8, price_change_percentage_24h: -2.1, total_volume: 1200000000, market_cap: 21000000000, market_cap_rank: 9 },
  'avalanche-2': { id: 'avalanche-2', name: 'Avalanche', symbol: 'avax', image: 'https://example.com/avax.png', current_price: 39, price_change_percentage_24h: 1.7, total_volume: 1100000000, market_cap: 15000000000, market_cap_rank: 11 },
  'tether-gold': { id: 'tether-gold', name: 'Tether Gold', symbol: 'xaut', image: 'https://example.com/xaut.png', current_price: 3340, price_change_percentage_24h: 0.4, total_volume: 12500000, market_cap: 823000000, market_cap_rank: 34 },
  gold: { id: 'gold', name: 'Gold', symbol: 'gold', image: 'https://example.com/gold.png', current_price: 0.000023, price_change_percentage_24h: 0, total_volume: 0.93, market_cap: 0, market_cap_rank: 1950 },
  'wrapped-bitcoin': { id: 'wrapped-bitcoin', name: 'Wrapped Bitcoin', symbol: 'wbtc', image: 'https://example.com/wbtc.png', current_price: 64980, price_change_percentage_24h: 2.4, total_volume: 320000000, market_cap: 10500000000, market_cap_rank: 18 },
};

const binance24hrTickers = {
  SOLUSDT: { symbol: 'SOLUSDT', lastPrice: '145', priceChangePercent: '4.1', quoteVolume: '8900000000' },
  ADAUSDT: { symbol: 'ADAUSDT', lastPrice: '0.71', priceChangePercent: '0.5', quoteVolume: '2100000000' },
};

async function mockApi(page) {
  await page.route('**/api/coingecko/**', async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === '/api/coingecko/coins/markets') {
      const ids = (url.searchParams.get('ids') || '').split(',').filter(Boolean);

      if (ids.length) {
        await route.fulfill({
          json: ids
            .map((id) => marketCoinsById[id])
            .filter(Boolean),
        });
        return;
      }

      await route.fulfill({ json: topCoins.map((coin) => ({ ...coin, name: coin.symbol })) });
      return;
    }

    if (url.pathname === '/api/coingecko/search') {
      const query = (url.searchParams.get('query') || '').toUpperCase();
      await route.fulfill({ json: { coins: searchResults[query] || [] } });
      return;
    }

    if (url.pathname === '/api/coingecko/simple/price') {
      const ids = (url.searchParams.get('ids') || '').split(',').filter(Boolean);
      const body = Object.fromEntries(
        ids.map((id) => [id, priceDetails[id] || { usd: 0, usd_24h_change: 0, usd_24h_vol: 0, usd_market_cap: 0 }])
      );
      await route.fulfill({ json: body });
      return;
    }

    await route.fulfill({ status: 404, json: {} });
  });

  await page.route('**/api/binance/**', async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === '/api/binance/ticker/24hr') {
      const symbols = JSON.parse(url.searchParams.get('symbols') || '[]');
      await route.fulfill({
        json: symbols
          .map((symbol) => binance24hrTickers[symbol])
          .filter(Boolean),
      });
      return;
    }

    await route.fulfill({ status: 404, json: {} });
  });
}

test.describe('Крипто Трекер: Основний функціонал', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
    });
    await mockApi(page);
    await page.goto('/');
  });

  test('Початковий список › відображає топові монети при завантаженні', async ({ page }) => {
    await expect(page.locator('#top10List .crypto-item')).toHaveCount(10);
    await expect(page.locator('#top10List')).toContainText('BTC');
    await expect(page.locator('#top10List')).toContainText('ETH');
  });

  test('Пошук та відкриття › користувач може знайти токен і відкрити його графік', async ({ page }) => {
    await page.fill('#tickerInput', 'SOL');
    await expect(page.locator('#suggestions button.suggestion-item')).toHaveCount(1);
    await page.locator('#suggestions button.suggestion-item').click();

    await expect(page.locator('.trade-page')).toBeVisible();
    await expect(page.locator('.trade-pair-label')).toContainText('SOL/USDT');
  });

  test('Дані ринку › відображаються ціна та обсяг для кожного токена', async ({ page }) => {
    const firstRow = page.locator('#top10List .crypto-item').first();

    await expect(firstRow.locator('.price')).toContainText('$');
    await expect(firstRow.locator('.volume')).not.toHaveText('');
  });

  test('Інтерфейс › поле пошуку очищується після повернення з графіка', async ({ page }) => {
    const input = page.locator('#tickerInput');

    await input.fill('ADA');
    await page.locator('#suggestions button.suggestion-item').click();
    await page.locator('.trade-back-btn').click();

    await expect(input).toHaveValue('');
  });

  test('Пошук › показує головний токен золота з ціною для GOLD', async ({ page }) => {
    await page.fill('#tickerInput', 'GOLD');

    const firstSuggestion = page.locator('#suggestions button.suggestion-item').first();
    await expect(firstSuggestion).toContainText('XAUT');
    await expect(firstSuggestion).toContainText('Tether Gold');
    await expect(firstSuggestion.locator('.suggestion-price')).toContainText('$3,340');
  });

  test('Пошук › залишає споріднені результати для BTC, але Bitcoin іде першим', async ({ page }) => {
    await page.fill('#tickerInput', 'BTC');

    const suggestions = page.locator('#suggestions button.suggestion-item');
    await expect(suggestions).toHaveCount(2);
    await expect(suggestions.first()).toContainText('BTC');
    await expect(suggestions.first()).toContainText('Bitcoin');
    await expect(page.locator('#suggestions')).toContainText('WBTC');
  });
});