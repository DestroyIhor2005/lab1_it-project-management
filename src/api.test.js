import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePriceChange, validateTicker, getStatusColor, fetchCoinPrice, resetApiCaches, searchCoins } from './api.js';

test('має правильно рахувати прибуток у відсотках', () => {
  assert.equal(calculatePriceChange(100, 110), 10);
});

test('має правильно рахувати збиток', () => {
  assert.equal(calculatePriceChange(100, 80), -20);
});

test('має повертати 0, якщо ціна не змінилась або початкова ціна 0', () => {
  assert.equal(calculatePriceChange(0, 100), 0);
  assert.equal(calculatePriceChange(100, 100), 0);
});

test('має валідувати коректні тикери (2-5 символів)', () => {
  assert.equal(validateTicker('btc'), true);
  assert.equal(validateTicker('ETH'), true);
  assert.equal(validateTicker('SOL'), true);
});

test('має відхиляти некоректні тикери', () => {
  assert.equal(validateTicker('B'), false);
  assert.equal(validateTicker('BITCOIN'), false);
  assert.equal(validateTicker(''), false);
});

test('має повертати правильний колір залежно від динаміки', () => {
  assert.equal(getStatusColor(5), 'green');
  assert.equal(getStatusColor(-5), 'red');
  assert.equal(getStatusColor(0), 'gray');
});

test('має імітувати отримання ціни з API через Mock', async () => {
  const originalFetch = global.fetch;
  let calls = 0;

  global.fetch = async () => {
    calls += 1;
    return {
      ok: true,
      json: async () => ({ bitcoin: { usd: 65000 } }),
    };
  };

  try {
    const price = await fetchCoinPrice('bitcoin');

    assert.equal(price, 65000);
    assert.equal(calls, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test('має відфільтровувати нерелевантні збіги і залишати тільки релевантні монети', async () => {
  const originalFetch = global.fetch;
  resetApiCaches();

  global.fetch = async (url) => {
    const requestUrl = String(url);

    if (requestUrl.includes('/search?query=PEPE')) {
      return {
        ok: true,
        json: async () => ({
          coins: [
            { id: 'pepe', name: 'Pepe', symbol: 'pepe', large: 'https://example.com/pepe.png' },
            { id: 'wrapped-xpl', name: 'Wrapped XPL', symbol: 'wxpl', large: 'https://example.com/wxpl.png' },
          ],
        }),
      };
    }

    if (requestUrl.includes('/coins/list?include_platform=false')) {
      return {
        ok: true,
        json: async () => ([]),
      };
    }

    if (requestUrl.includes('/coins/markets?vs_currency=usd&ids=pepe')) {
      return {
        ok: true,
        json: async () => ([
          {
            id: 'pepe',
            name: 'Pepe',
            symbol: 'pepe',
            image: 'https://example.com/pepe.png',
            current_price: 0.00000301,
            price_change_percentage_24h: 1.02,
            total_volume: 123400000,
            market_cap: 1300000000,
            market_cap_rank: 95,
          },
        ]),
      };
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({}),
    };
  };

  try {
    const results = await searchCoins('PEPE');

    assert.equal(results.length, 1);
    assert.equal(results[0].symbol, 'PEPE');
    assert.equal(results[0].price, 0.00000301);
  } finally {
    global.fetch = originalFetch;
  }
});

test('має брати CoinGecko ціну для дубліката symbol і не розмножувати одну Binance ціну на всі монети', async () => {
  const originalFetch = global.fetch;
  resetApiCaches();

  global.fetch = async (url) => {
    const requestUrl = String(url);

    if (requestUrl.includes('/search?query=PEPE')) {
      return {
        ok: true,
        json: async () => ({
          coins: [
            { id: 'pepe', name: 'Pepe', symbol: 'pepe', large: 'https://example.com/pepe.png' },
            { id: 'based-pepe', name: 'Based Pepe', symbol: 'pepe', large: 'https://example.com/based-pepe.png' },
          ],
        }),
      };
    }

    if (requestUrl.includes('/coins/list?include_platform=false')) {
      return {
        ok: true,
        json: async () => ([]),
      };
    }

    if (requestUrl.includes('/coins/markets?vs_currency=usd&ids=pepe,based-pepe')) {
      return {
        ok: true,
        json: async () => ([
          {
            id: 'pepe',
            name: 'Pepe',
            symbol: 'pepe',
            image: 'https://example.com/pepe.png',
            current_price: 0.00000301,
            price_change_percentage_24h: 1.02,
            total_volume: 123400000,
            market_cap: 1300000000,
            market_cap_rank: 95,
          },
          {
            id: 'based-pepe',
            name: 'Based Pepe',
            symbol: 'pepe',
            image: 'https://example.com/based-pepe.png',
            current_price: 0.00000999,
            price_change_percentage_24h: -4.5,
            total_volume: 2500000,
            market_cap: 9000000,
            market_cap_rank: 1500,
          },
        ]),
      };
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({}),
    };
  };

  try {
    const results = await searchCoins('PEPE');

    assert.equal(results.length, 2);
    const resultsById = Object.fromEntries(results.map((coin) => [coin.id, coin]));

    assert.equal(resultsById.pepe.price, 0.00000301);
    assert.equal(resultsById['based-pepe'].price, 0.00000999);
  } finally {
    global.fetch = originalFetch;
  }
});

test('має додавати результати з локального каталогу якщо CoinGecko search не повернув потрібний токен', async () => {
  const originalFetch = global.fetch;
  resetApiCaches();

  global.fetch = async (url) => {
    const requestUrl = String(url);

    if (requestUrl.includes('/search?query=GOLD')) {
      return {
        ok: true,
        json: async () => ({
          coins: [
            { id: 'tether-gold', name: 'Tether Gold', symbol: 'xaut', large: 'https://example.com/xaut.png', market_cap_rank: 34 },
          ],
        }),
      };
    }

    if (requestUrl.includes('/coins/list?include_platform=false')) {
      return {
        ok: true,
        json: async () => ([
          { id: 'gold', name: 'Gold', symbol: 'gold' },
          { id: 'tether-gold', name: 'Tether Gold', symbol: 'xaut' },
        ]),
      };
    }

    if (
      requestUrl.includes('/coins/markets?vs_currency=usd&ids=') &&
      requestUrl.includes('gold') &&
      requestUrl.includes('tether-gold')
    ) {
      return {
        ok: true,
        json: async () => ([
          {
            id: 'gold',
            name: 'Gold',
            symbol: 'gold',
            image: 'https://example.com/gold.png',
            current_price: 0.000023,
            price_change_percentage_24h: 0,
            total_volume: 0.93,
            market_cap: 0,
            market_cap_rank: 5000,
          },
          {
            id: 'tether-gold',
            name: 'Tether Gold',
            symbol: 'xaut',
            image: 'https://example.com/xaut.png',
            current_price: 3340,
            price_change_percentage_24h: 0.4,
            total_volume: 12500000,
            market_cap: 823000000,
            market_cap_rank: 120,
          },
        ]),
      };
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({}),
    };
  };

  try {
    const results = await searchCoins('GOLD');

    assert.ok(results.some((coin) => coin.id === 'gold'));
    assert.ok(results.some((coin) => coin.id === 'tether-gold'));
    assert.ok(results.some((coin) => coin.symbol === 'XAUT' && coin.price === 3340));
  } finally {
    global.fetch = originalFetch;
  }
});

test('має використовувати серверний пошук для широких запитів навіть коли локальний каталог уже завантажений', async () => {
  const originalFetch = global.fetch;
  resetApiCaches();

  global.fetch = async (url) => {
    const requestUrl = String(url);

    if (requestUrl.includes('/coins/list?include_platform=false')) {
      return {
        ok: true,
        json: async () => ([
          { id: 'gold-token', name: 'Gold Token', symbol: 'gold' },
          { id: 'gold-reserve', name: 'Gold Reserve', symbol: 'gold' },
          { id: 'goldfinch', name: 'Goldfinch', symbol: 'gfi' },
        ]),
      };
    }

    if (requestUrl.includes('/search?query=GOLD')) {
      return {
        ok: true,
        json: async () => ({
          coins: [
            { id: 'tether-gold', name: 'Tether Gold', symbol: 'xaut', large: 'https://example.com/xaut.png', market_cap_rank: 37 },
            { id: 'pax-gold', name: 'PAX Gold', symbol: 'paxg', large: 'https://example.com/paxg.png', market_cap_rank: 42 },
          ],
        }),
      };
    }

    if (
      requestUrl.includes('/coins/markets?vs_currency=usd&ids=') &&
      requestUrl.includes('tether-gold') &&
      requestUrl.includes('pax-gold')
    ) {
      return {
        ok: true,
        json: async () => ([
          {
            id: 'tether-gold',
            name: 'Tether Gold',
            symbol: 'xaut',
            image: 'https://example.com/xaut.png',
            current_price: 4420.68,
            price_change_percentage_24h: 0.99,
            total_volume: 913486467,
            market_cap: 2491201587,
            market_cap_rank: 37,
          },
          {
            id: 'pax-gold',
            name: 'PAX Gold',
            symbol: 'paxg',
            image: 'https://example.com/paxg.png',
            current_price: 4425.32,
            price_change_percentage_24h: 0.97,
            total_volume: 623764208,
            market_cap: 2238060435,
            market_cap_rank: 42,
          },
        ]),
      };
    }

    if (requestUrl.includes('/simple/price?ids=gold-token,gold-reserve,goldfinch')) {
      return {
        ok: true,
        json: async () => ({}),
      };
    }

    if (requestUrl.includes('/coins/gold-token?') || requestUrl.includes('/coins/gold-reserve?') || requestUrl.includes('/coins/goldfinch?')) {
      return {
        ok: false,
        status: 404,
        json: async () => ({}),
      };
    }

    if (requestUrl.includes('/ticker/24hr')) {
      return {
        ok: true,
        json: async () => ([]),
      };
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({}),
    };
  };

  try {
    const results = await searchCoins('GOLD');

    assert.equal(results[0].id, 'tether-gold');
    assert.equal(results[1].id, 'pax-gold');
    assert.equal(results[0].symbol, 'XAUT');
    assert.equal(results[0].price, 4420.68);
  } finally {
    global.fetch = originalFetch;
  }
});

test('має ставити основний ліквідний токен першим, але залишати споріднені результати для широких запитів', async () => {
  const originalFetch = global.fetch;
  resetApiCaches();

  global.fetch = async (url) => {
    const requestUrl = String(url);

    if (requestUrl.includes('/search?query=BTC')) {
      return {
        ok: true,
        json: async () => ({
          coins: [
            { id: 'bitcoin', name: 'Bitcoin', symbol: 'btc', large: 'https://example.com/btc.png', market_cap_rank: 1 },
            { id: 'wrapped-bitcoin', name: 'Wrapped Bitcoin', symbol: 'wbtc', large: 'https://example.com/wbtc.png', market_cap_rank: 18 },
            { id: 'bitcoin-avalanche-bridged-btc-b', name: 'Bitcoin Avalanche Bridged (BTC.b)', symbol: 'btc.b', large: 'https://example.com/btcb.png', market_cap_rank: 240 },
          ],
        }),
      };
    }

    if (requestUrl.includes('/coins/list?include_platform=false')) {
      return {
        ok: true,
        json: async () => ([]),
      };
    }

    if (requestUrl.includes('/coins/markets?vs_currency=usd&ids=bitcoin,wrapped-bitcoin,bitcoin-avalanche-bridged-btc-b')) {
      return {
        ok: true,
        json: async () => ([
          {
            id: 'bitcoin',
            name: 'Bitcoin',
            symbol: 'btc',
            image: 'https://example.com/btc.png',
            current_price: 65000,
            price_change_percentage_24h: 2.5,
            total_volume: 51000000000,
            market_cap: 1280000000000,
            market_cap_rank: 1,
          },
          {
            id: 'wrapped-bitcoin',
            name: 'Wrapped Bitcoin',
            symbol: 'wbtc',
            image: 'https://example.com/wbtc.png',
            current_price: 64980,
            price_change_percentage_24h: 2.4,
            total_volume: 320000000,
            market_cap: 10500000000,
            market_cap_rank: 18,
          },
          {
            id: 'bitcoin-avalanche-bridged-btc-b',
            name: 'Bitcoin Avalanche Bridged (BTC.b)',
            symbol: 'btc.b',
            image: 'https://example.com/btcb.png',
            current_price: 64920,
            price_change_percentage_24h: 2.35,
            total_volume: 12000000,
            market_cap: 520000000,
            market_cap_rank: 240,
          },
        ]),
      };
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({}),
    };
  };

  try {
    const results = await searchCoins('BTC');

    assert.equal(results[0].id, 'bitcoin');
    assert.ok(results.some((coin) => coin.id === 'wrapped-bitcoin'));
    assert.ok(results.some((coin) => coin.id === 'bitcoin-avalanche-bridged-btc-b'));
  } finally {
    global.fetch = originalFetch;
  }
});

test('має виключати шумні mid-word збіги для ADA і залишати споріднені ADA-токени', async () => {
  const originalFetch = global.fetch;
  resetApiCaches();

  global.fetch = async (url) => {
    const requestUrl = String(url);

    if (requestUrl.includes('/search?query=ADA')) {
      return {
        ok: true,
        json: async () => ({
          coins: [
            { id: 'cardano', name: 'Cardano', symbol: 'ada', large: 'https://example.com/ada.png', market_cap_rank: 13 },
            { id: 'pc0000031', name: 'Tradable NA Rent Financing Platform SSTN', symbol: 'pc0000031', large: 'https://example.com/pc1.png', market_cap_rank: 6000 },
            { id: 'metadao', name: 'MetaDAO', symbol: 'meta', large: 'https://example.com/meta.png', market_cap_rank: 5000 },
            { id: 'ada-sol', name: 'ADA', symbol: 'adasol', large: 'https://example.com/adasol.png', market_cap_rank: 1500 },
          ],
        }),
      };
    }

    if (requestUrl.includes('/coins/list?include_platform=false')) {
      return {
        ok: true,
        json: async () => ([]),
      };
    }

    if (requestUrl.includes('/coins/markets?vs_currency=usd&ids=cardano,ada-sol')) {
      return {
        ok: true,
        json: async () => ([
          {
            id: 'cardano',
            name: 'Cardano',
            symbol: 'ada',
            image: 'https://example.com/ada.png',
            current_price: 0.69,
            price_change_percentage_24h: 0.25,
            total_volume: 2000000000,
            market_cap: 24000000000,
            market_cap_rank: 13,
          },
          {
            id: 'ada-sol',
            name: 'ADA',
            symbol: 'adasol',
            image: 'https://example.com/adasol.png',
            current_price: 0.00011,
            price_change_percentage_24h: -2.5,
            total_volume: 850000,
            market_cap: 4000000,
            market_cap_rank: 1500,
          },
        ]),
      };
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({}),
    };
  };

  try {
    const results = await searchCoins('ADA');
    const resultIds = results.map((coin) => coin.id);

    assert.ok(resultIds.includes('cardano'));
    assert.ok(resultIds.includes('ada-sol'));
    assert.ok(!resultIds.includes('pc0000031'));
    assert.ok(!resultIds.includes('metadao'));
  } finally {
    global.fetch = originalFetch;
  }
});

test('має повертати рекомендації з CoinGecko market data', async () => {
  const originalFetch = global.fetch;
  resetApiCaches();

  global.fetch = async (url) => {
    const requestUrl = String(url);

    if (requestUrl.includes('/search?query=ADA')) {
      return {
        ok: true,
        json: async () => ({
          coins: [
            { id: 'cardano', name: 'Cardano', symbol: 'ada', large: 'https://example.com/ada.png' },
          ],
        }),
      };
    }

    if (requestUrl.includes('/coins/list?include_platform=false')) {
      return {
        ok: true,
        json: async () => ([]),
      };
    }

    if (requestUrl.includes('/coins/markets?vs_currency=usd&ids=cardano')) {
      return {
        ok: true,
        json: async () => ([
          {
            id: 'cardano',
            name: 'Cardano',
            symbol: 'ada',
            image: 'https://example.com/ada.png',
            current_price: 0.69,
            price_change_percentage_24h: 0.25,
            total_volume: 2000000000,
            market_cap: 24000000000,
            market_cap_rank: 13,
          },
        ]),
      };
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({}),
    };
  };

  try {
    const results = await searchCoins('ADA');

    assert.equal(results.length, 1);
    assert.deepEqual(results[0], {
      id: 'cardano',
      name: 'Cardano',
      symbol: 'ADA',
      image: 'https://example.com/ada.png',
      price: 0.69,
      change24h: 0.25,
      volume: '2.0B',
      marketCap: '24.0B',
      marketCapRank: 13,
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('має повертати ціну CoinGecko для токенів без Binance-пари', async () => {
  const originalFetch = global.fetch;
  resetApiCaches();

  global.fetch = async (url) => {
    const requestUrl = String(url);

    if (requestUrl.includes('/search?query=GRASS')) {
      return {
        ok: true,
        json: async () => ({
          coins: [
            { id: 'grass', name: 'Grass', symbol: 'grass', large: 'https://example.com/grass.png' },
          ],
        }),
      };
    }

    if (requestUrl.includes('/coins/list?include_platform=false')) {
      return {
        ok: true,
        json: async () => ([]),
      };
    }

    if (requestUrl.includes('/coins/markets?vs_currency=usd&ids=grass')) {
      return {
        ok: true,
        json: async () => ([
          {
            id: 'grass',
            name: 'Grass',
            symbol: 'grass',
            image: 'https://example.com/grass.png',
            current_price: 1.88,
            price_change_percentage_24h: -3.4,
            total_volume: 34000000,
            market_cap: 450000000,
            market_cap_rank: 176,
          },
        ]),
      };
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({}),
    };
  };

  try {
    const results = await searchCoins('GRASS');

    assert.equal(results.length, 1);
    assert.deepEqual(results[0], {
      id: 'grass',
      name: 'Grass',
      symbol: 'GRASS',
      image: 'https://example.com/grass.png',
      price: 1.88,
      change24h: -3.4,
      volume: '34.0M',
      marketCap: '450.0M',
      marketCapRank: 176,
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('має повертати рекомендації через simple price якщо markets endpoint тимчасово недоступний', async () => {
  const originalFetch = global.fetch;
  resetApiCaches();

  global.fetch = async (url) => {
    const requestUrl = String(url);

    if (requestUrl.includes('/search?query=ADA')) {
      return {
        ok: true,
        json: async () => ({
          coins: [
            { id: 'cardano', name: 'Cardano', symbol: 'ada', large: 'https://example.com/ada.png' },
          ],
        }),
      };
    }

    if (requestUrl.includes('/coins/list?include_platform=false')) {
      return {
        ok: true,
        json: async () => ([]),
      };
    }

    if (requestUrl.includes('/simple/price?ids=cardano')) {
      return {
        ok: true,
        json: async () => ({
          cardano: {
            usd: 0.69,
            usd_24h_change: 0.25,
            usd_24h_vol: 2000000000,
            usd_market_cap: 24000000000,
          },
        }),
      };
    }

    if (requestUrl.includes('/coins/markets?vs_currency=usd&ids=cardano')) {
      return {
        ok: false,
        status: 429,
        json: async () => ({ status: { error_message: 'rate limited' } }),
      };
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({}),
    };
  };

  try {
    const results = await searchCoins('ADA');

    assert.equal(results.length, 1);
    assert.deepEqual(results[0], {
      id: 'cardano',
      name: 'Cardano',
      symbol: 'ADA',
      image: 'https://example.com/ada.png',
      price: 0.69,
      change24h: 0.25,
      volume: '2.0B',
      marketCap: '24.0B',
      marketCapRank: null,
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('має знаходити монету через локальний каталог навіть якщо CoinGecko search throttled', async () => {
  const originalFetch = global.fetch;
  resetApiCaches();

  global.fetch = async (url) => {
    const requestUrl = String(url);

    if (requestUrl.includes('/search?query=GRASS')) {
      return {
        ok: false,
        status: 429,
        json: async () => ({ status: { error_message: 'rate limited' } }),
      };
    }

    if (requestUrl.includes('/coins/list?include_platform=false')) {
      return {
        ok: true,
        json: async () => ([
          { id: 'grass', name: 'Grass', symbol: 'grass' },
        ]),
      };
    }

    if (requestUrl.includes('/coins/markets?vs_currency=usd&ids=grass')) {
      return {
        ok: true,
        json: async () => ([
          {
            id: 'grass',
            name: 'Grass',
            symbol: 'grass',
            image: 'https://example.com/grass.png',
            current_price: 1.88,
            price_change_percentage_24h: -3.4,
            total_volume: 34000000,
            market_cap: 450000000,
            market_cap_rank: 176,
          },
        ]),
      };
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({}),
    };
  };

  try {
    const results = await searchCoins('GRASS');

    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'grass');
    assert.equal(results[0].symbol, 'GRASS');
  } finally {
    global.fetch = originalFetch;
  }
});

test('має повертати metadata-only рекомендації якщо ціни тимчасово недоступні', async () => {
  const originalFetch = global.fetch;
  resetApiCaches();

  global.fetch = async (url) => {
    const requestUrl = String(url);

    if (requestUrl.includes('/search?query=ADA')) {
      return {
        ok: true,
        json: async () => ({
          coins: [
            { id: 'cardano', name: 'Cardano', symbol: 'ada', large: 'https://example.com/ada.png', market_cap_rank: 13 },
          ],
        }),
      };
    }

    if (requestUrl.includes('/coins/markets?vs_currency=usd&ids=cardano')) {
      return {
        ok: false,
        status: 429,
        json: async () => ({ status: { error_message: 'rate limited' } }),
      };
    }

    if (requestUrl.includes('/simple/price?ids=cardano')) {
      return {
        ok: false,
        status: 429,
        json: async () => ({ status: { error_message: 'rate limited' } }),
      };
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({}),
    };
  };

  try {
    const results = await searchCoins('ADA');

    assert.equal(results.length, 1);
    assert.deepEqual(results[0], {
      id: 'cardano',
      name: 'Cardano',
      symbol: 'ADA',
      image: 'https://example.com/ada.png',
      price: null,
      change24h: null,
      volume: 'N/A',
      marketCap: 'N/A',
      marketCapRank: 13,
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('має брати ціну з Binance для пошуку, якщо CoinGecko price endpoints вже недоступні', async () => {
  const originalFetch = global.fetch;
  resetApiCaches();

  global.fetch = async (url) => {
    const requestUrl = String(url);

    if (requestUrl.includes('/search?query=SOL')) {
      return {
        ok: true,
        json: async () => ({
          coins: [
            { id: 'solana', name: 'Solana', symbol: 'sol', large: 'https://example.com/sol.png' },
          ],
        }),
      };
    }

    if (requestUrl.includes('/coins/list?include_platform=false')) {
      return {
        ok: true,
        json: async () => ([]),
      };
    }

    if (requestUrl.includes('/coins/markets?vs_currency=usd&ids=solana')) {
      return {
        ok: false,
        status: 429,
        json: async () => ({ status: { error_message: 'rate limit' } }),
      };
    }

    if (requestUrl.includes('/ticker/24hr') && requestUrl.includes('SOLUSDT')) {
      return {
        ok: true,
        json: async () => ([
          {
            symbol: 'SOLUSDT',
            lastPrice: '145.12',
            priceChangePercent: '4.10',
            quoteVolume: '8900000000',
          },
        ]),
      };
    }

    if (requestUrl.includes('/simple/price?ids=solana')) {
      return {
        ok: false,
        status: 429,
        json: async () => ({ status: { error_message: 'rate limit' } }),
      };
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({}),
    };
  };

  try {
    const results = await searchCoins('SOL');

    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'solana');
    assert.equal(results[0].price, 145.12);
    assert.equal(results[0].change24h, 4.1);
  } finally {
    global.fetch = originalFetch;
  }
});

test('не має розмножувати Binance fallback ціну на всі результати з однаковим symbol', async () => {
  const originalFetch = global.fetch;
  resetApiCaches();

  global.fetch = async (url) => {
    const requestUrl = String(url);

    if (requestUrl.includes('/search?query=PEPE')) {
      return {
        ok: true,
        json: async () => ({
          coins: [
            { id: 'pepe', name: 'Pepe', symbol: 'pepe', large: 'https://example.com/pepe.png' },
            { id: 'baby-pepe', name: 'Baby Pepe', symbol: 'pepe', large: 'https://example.com/baby-pepe.png' },
          ],
        }),
      };
    }

    if (requestUrl.includes('/coins/list?include_platform=false')) {
      return {
        ok: true,
        json: async () => ([]),
      };
    }

    if (requestUrl.includes('/coins/markets?vs_currency=usd&ids=pepe,baby-pepe')) {
      return {
        ok: false,
        status: 429,
        json: async () => ({ status: { error_message: 'rate limit' } }),
      };
    }

    if (requestUrl.includes('/ticker/24hr?symbol=PEPEUSDT')) {
      return {
        ok: true,
        json: async () => ({
          symbol: 'PEPEUSDT',
          lastPrice: '0.00000334',
          priceChangePercent: '1.52',
          quoteVolume: '345000000',
        }),
      };
    }

    if (requestUrl.includes('/simple/price?ids=pepe,baby-pepe')) {
      return {
        ok: false,
        status: 429,
        json: async () => ({ status: { error_message: 'rate limit' } }),
      };
    }

    if (requestUrl.includes('/coins/pepe?')) {
      return {
        ok: true,
        json: async () => ({
          id: 'pepe',
          name: 'Pepe',
          symbol: 'pepe',
          image: { large: 'https://example.com/pepe.png' },
          market_cap_rank: 95,
          market_data: {
            current_price: { usd: 0.00000334 },
            price_change_percentage_24h: 1.52,
            total_volume: { usd: 345000000 },
            market_cap: { usd: 1300000000 },
          },
        }),
      };
    }

    if (requestUrl.includes('/coins/baby-pepe?')) {
      return {
        ok: true,
        json: async () => ({
          id: 'baby-pepe',
          name: 'Baby Pepe',
          symbol: 'pepe',
          image: { large: 'https://example.com/baby-pepe.png' },
          market_cap_rank: 1200,
          market_data: {
            current_price: { usd: 0.00000012 },
            price_change_percentage_24h: -2.11,
            total_volume: { usd: 1500000 },
            market_cap: { usd: 8000000 },
          },
        }),
      };
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({}),
    };
  };

  try {
    const results = await searchCoins('PEPE');
    const byId = Object.fromEntries(results.map((coin) => [coin.id, coin]));

    assert.equal(byId.pepe.price, 0.00000334);
    assert.equal(byId['baby-pepe'].price, 0.00000012);
    assert.notEqual(byId.pepe.price, byId['baby-pepe'].price);
  } finally {
    global.fetch = originalFetch;
  }
});

test('має брати ціну з детального CoinGecko endpoint для пошуку, якщо markets і simple price не дали результат', async () => {
  const originalFetch = global.fetch;
  resetApiCaches();

  global.fetch = async (url) => {
    const requestUrl = String(url);

    if (requestUrl.includes('/search?query=GRASS')) {
      return {
        ok: true,
        json: async () => ({
          coins: [
            { id: 'grass', name: 'Grass', symbol: 'grass', large: 'https://example.com/grass.png', market_cap_rank: 176 },
          ],
        }),
      };
    }

    if (requestUrl.includes('/coins/list?include_platform=false')) {
      return {
        ok: true,
        json: async () => ([]),
      };
    }

    if (requestUrl.includes('/coins/markets?vs_currency=usd&ids=grass')) {
      return {
        ok: true,
        json: async () => ([]),
      };
    }

    if (requestUrl.includes('/ticker/24hr?symbol=GRASSUSDT')) {
      return {
        ok: false,
        status: 404,
        json: async () => ({}),
      };
    }

    if (requestUrl.includes('/simple/price?ids=grass')) {
      return {
        ok: true,
        json: async () => ({}),
      };
    }

    if (requestUrl.includes('/coins/grass?')) {
      return {
        ok: true,
        json: async () => ({
          id: 'grass',
          name: 'Grass',
          symbol: 'grass',
          image: { large: 'https://example.com/grass.png' },
          market_cap_rank: 176,
          market_data: {
            current_price: { usd: 1.88 },
            price_change_percentage_24h: -3.4,
            total_volume: { usd: 34000000 },
            market_cap: { usd: 450000000 },
          },
        }),
      };
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({}),
    };
  };

  try {
    const results = await searchCoins('GRASS');

    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'grass');
    assert.equal(results[0].price, 1.88);
    assert.equal(results[0].change24h, -3.4);
  } finally {
    global.fetch = originalFetch;
  }
});