import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchCoinsSnapshot,
  getBinanceTickerSymbol,
  getTop10ByVolume,
  prefetchCoinsDirectory,
  searchCoins,
  subscribeToBinanceTickers,
} from './api.js';

const WATCHLIST_KEY = 'cryptoWatchlist';
const FAVORITES_KEY = 'cryptoFavorites';
const TOP10_CACHE_KEY = 'cryptoTop10Cache';
const TOP10_CACHE_TIME_KEY = 'cryptoTop10CacheTime';
const SEARCH_CACHE_KEY = 'cryptoSearchSuggestionsCacheV4';
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const FIXED_TWO_DECIMAL_SYMBOLS = new Set(['USDT', 'USDC', 'USD1', 'FDUSD', 'TUSD', 'BUSD', 'DAI']);

const readCachedCoins = (storageKey) => {
  try {
    const rawValue = localStorage.getItem(storageKey);
    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [];
  }
};

const readCachedDate = (storageKey) => {
  try {
    const rawValue = localStorage.getItem(storageKey);
    if (!rawValue) {
      return null;
    }

    const parsedDate = new Date(rawValue);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  } catch {
    return null;
  }
};

const readSearchCache = () => {
  try {
    const rawValue = localStorage.getItem(SEARCH_CACHE_KEY);
    if (!rawValue) {
      return {};
    }

    const parsedValue = JSON.parse(rawValue);
    return parsedValue && typeof parsedValue === 'object' ? parsedValue : {};
  } catch {
    return {};
  }
};

const normalizeSearchQuery = (value) => String(value || '').trim().toUpperCase();

const rankInstantSuggestions = (query, coins) => {
  const normalizedQuery = String(query || '').trim().toLowerCase();

  return [...coins].sort((leftCoin, rightCoin) => {
    const leftSymbol = String(leftCoin.symbol || '').trim().toLowerCase();
    const rightSymbol = String(rightCoin.symbol || '').trim().toLowerCase();
    const leftName = String(leftCoin.name || '').trim().toLowerCase();
    const rightName = String(rightCoin.name || '').trim().toLowerCase();

    const leftExact = leftSymbol === normalizedQuery || leftName === normalizedQuery;
    const rightExact = rightSymbol === normalizedQuery || rightName === normalizedQuery;

    if (leftExact !== rightExact) {
      return leftExact ? -1 : 1;
    }

    const leftPrefix = leftSymbol.startsWith(normalizedQuery) || leftName.startsWith(normalizedQuery);
    const rightPrefix = rightSymbol.startsWith(normalizedQuery) || rightName.startsWith(normalizedQuery);

    if (leftPrefix !== rightPrefix) {
      return leftPrefix ? -1 : 1;
    }

    return leftSymbol.localeCompare(rightSymbol) || leftName.localeCompare(rightName);
  });
};

const hasSuggestionPrice = (coin) => Number.isFinite(Number(coin?.price)) && Number(coin.price) > 0;

const getPricedSuggestions = (coins) => coins.filter((coin) => hasSuggestionPrice(coin));

const mergeSuggestionCoinData = (nextCoin, knownCoin) => {
  if (!knownCoin) {
    return nextCoin;
  }

  return {
    ...knownCoin,
    ...nextCoin,
    name: nextCoin.name || knownCoin.name || '',
    symbol: nextCoin.symbol || knownCoin.symbol || '',
    image: nextCoin.image || knownCoin.image || '',
    price: hasSuggestionPrice(nextCoin) ? nextCoin.price : knownCoin.price ?? nextCoin.price,
    change24h: nextCoin.change24h ?? knownCoin.change24h ?? null,
    volume: nextCoin.volume && nextCoin.volume !== 'N/A' ? nextCoin.volume : knownCoin.volume || nextCoin.volume,
    marketCap: nextCoin.marketCap && nextCoin.marketCap !== 'N/A' ? nextCoin.marketCap : knownCoin.marketCap || nextCoin.marketCap,
    marketCapRank: nextCoin.marketCapRank ?? knownCoin.marketCapRank ?? null,
  };
};

const enrichSuggestionsWithKnownData = (coins, knownCoinsById) =>
  coins.map((coin) => mergeSuggestionCoinData(coin, knownCoinsById[coin.id]));

const persistKnownSuggestions = (knownCoinsById, coins) => {
  const nextKnownCoinsById = { ...knownCoinsById };

  coins.forEach((coin) => {
    if (!coin?.id) {
      return;
    }

    nextKnownCoinsById[coin.id] = mergeSuggestionCoinData(coin, nextKnownCoinsById[coin.id]);
  });

  return nextKnownCoinsById;
};

const getInstantSuggestions = (query, coins) => {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 2) {
    return [];
  }

  const normalizedQuery = trimmedQuery.toLowerCase();
  const uniqueCoins = new Map();

  coins.forEach((coin) => {
    if (!coin?.id || uniqueCoins.has(coin.id)) {
      return;
    }

    const symbol = String(coin.symbol || '').toLowerCase();
    const name = String(coin.name || '').toLowerCase();

    if (!symbol.includes(normalizedQuery) && !name.includes(normalizedQuery)) {
      return;
    }

    uniqueCoins.set(coin.id, coin);
  });

  return rankInstantSuggestions(trimmedQuery, [...uniqueCoins.values()]).slice(0, 5);
};

const getCachedSuggestionsForQuery = (cache, query) => {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) {
    return [];
  }

  const now = Date.now();
  const exactMatch = cache[normalizedQuery];
  if (exactMatch && now - exactMatch.timestamp <= SEARCH_CACHE_TTL_MS) {
    return Array.isArray(exactMatch.results) ? exactMatch.results : [];
  }

  const prefixMatch = Object.entries(cache)
    .filter(([cachedQuery, entry]) => {
      if (!entry || now - entry.timestamp > SEARCH_CACHE_TTL_MS) {
        return false;
      }

      return normalizedQuery.startsWith(cachedQuery) || cachedQuery.startsWith(normalizedQuery);
    })
    .sort((leftEntry, rightEntry) => rightEntry[0].length - leftEntry[0].length)[0];

  if (!prefixMatch) {
    return [];
  }

  return Array.isArray(prefixMatch[1].results) ? prefixMatch[1].results : [];
};

const persistSearchCache = (cache) => {
  try {
    localStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage quota failures for transient search cache.
  }
};

const formatTinyPrice = (numericValue) => {
  const absoluteValue = Math.abs(numericValue);
  if (absoluteValue === 0) {
    return '0.000000';
  }

  const exponential = absoluteValue.toExponential(12);
  const [mantissa] = exponential.split('e-');
  const digits = mantissa.replace('.', '').replace(/^0+/, '').slice(0, 3) || '0';
  const zeroCount = Math.max(0, Math.floor(-Math.log10(absoluteValue)) - 1);
  const sign = numericValue < 0 ? '-' : '';

  return `${sign}0.0{${zeroCount}}${digits}`;
};

const formatPrice = (value, symbol = '') =>
  {
    const numericValue = Number(value || 0);
    const normalizedSymbol = String(symbol || '').trim().toUpperCase();

    if (!Number.isFinite(numericValue)) {
      return '0.00';
    }

    if (FIXED_TWO_DECIMAL_SYMBOLS.has(normalizedSymbol)) {
      return numericValue.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }

    if (numericValue >= 1000) {
      return numericValue.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }

    if (numericValue >= 1) {
      return numericValue.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      });
    }

    if (numericValue >= 0.01) {
      return numericValue.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
      });
    }

    if (numericValue >= 0.000001) {
      return numericValue.toLocaleString('en-US', {
        minimumFractionDigits: 6,
        maximumFractionDigits: 8,
      });
    }

    if (numericValue > 0) {
      return formatTinyPrice(numericValue);
    }

    return numericValue.toLocaleString('en-US', {
      minimumFractionDigits: 6,
      maximumFractionDigits: 8,
    });
  };

const normalizeLabel = (value) => String(value || '').trim().toLowerCase();

function App() {
  const envStatus = import.meta.env.VITE_APP_STATUS || 'unknown';

  const [top10, setTop10] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [searchNotice, setSearchNotice] = useState('');
  const [marketNotice, setMarketNotice] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [streamStatus, setStreamStatus] = useState('idle');
  const [hasResolvedSearch, setHasResolvedSearch] = useState(false);
  const top10Ref = useRef([]);
  const watchlistRef = useRef([]);
  const favoritesRef = useRef([]);
  const searchCacheRef = useRef({});
  const knownSuggestionsRef = useRef({});

  const streamKey = [...new Set([
    ...top10.map((coin) => coin.symbol),
    ...watchlist.map((coin) => coin.symbol),
    ...favorites.map((coin) => coin.symbol),
  ])]
    .filter((symbol) => getBinanceTickerSymbol(symbol))
    .sort()
    .join('|');

  const trackedSymbols = useMemo(
    () => (streamKey ? streamKey.split('|') : []),
    [streamKey]
  );
  const searchSourceCoins = useMemo(
    () => [...watchlist, ...favorites, ...top10],
    [favorites, top10, watchlist]
  );

  const searchSourceKey = useMemo(
    () => searchSourceCoins
      .map((coin) => `${coin.id}:${coin.symbol}:${coin.name}`)
      .sort()
      .join('|'),
    [searchSourceCoins]
  );

  const mergeCoinUpdates = (currentList, freshList) => {
    if (!freshList.length) return currentList;

    const freshById = new Map(freshList.map((coin) => [coin.id, coin]));

    return currentList.map((coin) => {
      const fresh = freshById.get(coin.id);
      if (!fresh) return coin;
      return {
        ...coin,
        price: fresh.price,
        change24h: fresh.change24h,
        volume: fresh.volume,
        marketCap: fresh.marketCap,
      };
    });
  };

  const applyLiveTickerUpdate = (currentList, ticker) => {
    let hasChanges = false;

    const nextList = currentList.map((coin) => {
      if (coin.symbol !== ticker.symbol) return coin;

      hasChanges = true;
      return {
        ...coin,
        price: ticker.price,
        change24h: ticker.change24h,
      };
    });

    return hasChanges ? nextList : currentList;
  };

  useEffect(() => {
    const savedWatchlist = readCachedCoins(WATCHLIST_KEY);
    const savedFavorites = readCachedCoins(FAVORITES_KEY);
    const cachedTop10 = readCachedCoins(TOP10_CACHE_KEY);
    const cachedTop10Time = readCachedDate(TOP10_CACHE_TIME_KEY);
    searchCacheRef.current = readSearchCache();

    setWatchlist(savedWatchlist);
    setFavorites(savedFavorites);

    if (cachedTop10.length) {
      setTop10(cachedTop10);
      setLastUpdated(cachedTop10Time);
      setMarketNotice('');
    }
  }, []);

  useEffect(() => {
    if (!top10.length) {
      return;
    }

    localStorage.setItem(TOP10_CACHE_KEY, JSON.stringify(top10));

    if (lastUpdated) {
      localStorage.setItem(TOP10_CACHE_TIME_KEY, lastUpdated.toISOString());
    }
  }, [top10, lastUpdated]);

  useEffect(() => {
    top10Ref.current = top10;
  }, [top10]);

  useEffect(() => {
    knownSuggestionsRef.current = persistKnownSuggestions(knownSuggestionsRef.current, top10);
  }, [top10]);

  useEffect(() => {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist));
    watchlistRef.current = watchlist;
    knownSuggestionsRef.current = persistKnownSuggestions(knownSuggestionsRef.current, watchlist);
  }, [watchlist]);

  useEffect(() => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    favoritesRef.current = favorites;
    knownSuggestionsRef.current = persistKnownSuggestions(knownSuggestionsRef.current, favorites);
  }, [favorites]);

  useEffect(() => {
    knownSuggestionsRef.current = persistKnownSuggestions(
      knownSuggestionsRef.current,
      getPricedSuggestions(suggestions)
    );
  }, [suggestions]);

  useEffect(() => {
    let ignore = false;
    const hasCachedTop10 = readCachedCoins(TOP10_CACHE_KEY).length > 0;

    const loadTop10 = async () => {
      const coins = await getTop10ByVolume();
      if (ignore) return;

      if (coins.length) {
        setTop10(coins);
        setLastUpdated(new Date());
        setMarketNotice('');
        return;
      }

      setMarketNotice(
        hasCachedTop10
          ? ''
          : 'Не вдалося оновити ринок. Спробуй перезавантажити сторінку трохи пізніше.'
      );
    };

    loadTop10();
    prefetchCoinsDirectory().catch(() => {});

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setIsLoadingSuggestions(false);
      setHasResolvedSearch(false);
      setSearchNotice('');
      return;
    }

    const instantSuggestions = enrichSuggestionsWithKnownData(
      getInstantSuggestions(trimmed, searchSourceCoins),
      knownSuggestionsRef.current
    );
    const cachedSuggestions = enrichSuggestionsWithKnownData(
      getCachedSuggestionsForQuery(searchCacheRef.current, trimmed),
      knownSuggestionsRef.current
    );
    const fallbackSuggestions = cachedSuggestions.length ? cachedSuggestions : instantSuggestions;

    if (fallbackSuggestions.length) {
      setSuggestions(fallbackSuggestions);
      setHasResolvedSearch(true);
    }

    setIsLoadingSuggestions(true);
    if (!fallbackSuggestions.length) {
      setHasResolvedSearch(false);
    }
    setSearchNotice('');

    let ignore = false;

    const timer = setTimeout(async () => {
      try {
        const results = await searchCoins(trimmed);
        if (ignore) return;

        const enrichedResults = enrichSuggestionsWithKnownData(results, knownSuggestionsRef.current);
        const pricedResults = getPricedSuggestions(enrichedResults);
        const hasPricedResults = pricedResults.length > 0;

        if (hasPricedResults) {
          knownSuggestionsRef.current = persistKnownSuggestions(knownSuggestionsRef.current, pricedResults);

          const normalizedQuery = normalizeSearchQuery(trimmed);
          const nextCache = {
            ...searchCacheRef.current,
            [normalizedQuery]: {
              timestamp: Date.now(),
              results: pricedResults,
            },
          };

          searchCacheRef.current = nextCache;
          persistSearchCache(nextCache);

          setSuggestions(pricedResults);
          setSearchNotice('');
        } else if (enrichedResults.length) {
          setSuggestions(enrichedResults);
          setSearchNotice('');
        } else if (!fallbackSuggestions.length) {
          setSuggestions([]);
          setSearchNotice('Нічого не знайдено');
        } else {
          setSuggestions(fallbackSuggestions);
          setSearchNotice('');
        }
      } catch (error) {
        if (ignore) return;

        if (!fallbackSuggestions.length) {
          setSuggestions([]);
        } else {
          setSuggestions(fallbackSuggestions);
        }

        setSearchNotice(
          error?.code === 'COINGECKO_RATE_LIMIT'
            ? 'CoinGecko тимчасово обмежив пошук. Спробуй ще раз трохи пізніше.'
            : 'Не вдалося завантажити результати пошуку.'
        );
      } finally {
        if (!ignore) {
          setIsLoadingSuggestions(false);
          setHasResolvedSearch(true);
        }
      }
    }, 300);

    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [query, searchSourceKey]);

  useEffect(() => {
    const unsubscribe = subscribeToBinanceTickers(trackedSymbols, {
      onStatusChange: setStreamStatus,
      onTicker: (ticker) => {
        setTop10((currentList) => applyLiveTickerUpdate(currentList, ticker));
        setWatchlist((currentList) => applyLiveTickerUpdate(currentList, ticker));
        setFavorites((currentList) => applyLiveTickerUpdate(currentList, ticker));
        setLastUpdated(new Date());
      },
    });

    return () => {
      unsubscribe();
    };
  }, [trackedSymbols]);

  useEffect(() => {
    const refresh = async () => {
      const latestTop = await getTop10ByVolume();
      if (latestTop.length) {
        setTop10(latestTop);
        if (streamStatus !== 'connected') {
          setLastUpdated(new Date());
        }
        setMarketNotice('');
      } else {
        setMarketNotice(
          streamStatus === 'connected' || top10Ref.current.length
            ? ''
            : 'Не вдалося оновити ринок. Показуємо останні доступні дані.'
        );
      }

      const updatedWatchlist = await fetchCoinsSnapshot(
        watchlistRef.current.map((coin) => coin.id),
        Object.fromEntries(
          watchlistRef.current.map((coin) => [coin.id, { name: coin.name, symbol: coin.symbol, image: coin.image }])
        )
      );
      const updatedFavorites = await fetchCoinsSnapshot(
        favoritesRef.current.map((coin) => coin.id),
        Object.fromEntries(
          favoritesRef.current.map((coin) => [coin.id, { name: coin.name, symbol: coin.symbol, image: coin.image }])
        )
      );

      setWatchlist((currentList) => mergeCoinUpdates(currentList, updatedWatchlist));
      setFavorites((currentList) => mergeCoinUpdates(currentList, updatedFavorites));
    };

    const interval = setInterval(refresh, 60000);
    return () => clearInterval(interval);
  }, [streamStatus]);

  const addToWatchlist = (coin) => {
    setWatchlist((prev) => {
      if (prev.some((item) => item.id === coin.id)) return prev;
      return [coin, ...prev];
    });
    setQuery('');
    setSuggestions([]);
  };

  const addToFavorites = (coin) => {
    setFavorites((prev) => {
      if (prev.some((item) => item.id === coin.id)) return prev;
      return [coin, ...prev];
    });
  };

  const removeFromWatchlist = (coinId) => {
    setWatchlist((prev) => prev.filter((coin) => coin.id !== coinId));
  };

  const removeFromFavorites = (coinId) => {
    setFavorites((prev) => prev.filter((coin) => coin.id !== coinId));
  };

  const handleQueryChange = (event) => {
    const nextQuery = event.target.value.toUpperCase();
    setQuery(nextQuery);

    if (nextQuery.trim().length >= 2) {
      setIsLoadingSuggestions(true);
      return;
    }

    setIsLoadingSuggestions(false);
    setSuggestions([]);
  };

  const suggestionVisible = useMemo(
    () => query.trim().length >= 2,
    [query]
  );

  const renderSuggestionName = (coin) => {
    const normalizedSymbol = normalizeLabel(coin.symbol);
    const normalizedName = normalizeLabel(coin.name);

    if (normalizedName && normalizedName !== normalizedSymbol) {
      return coin.name;
    }

    return '';
  };

  const renderSuggestionPrice = (coin) => {
    if (coin.price == null || !Number.isFinite(Number(coin.price))) {
      return 'N/A';
    }

    return `$${formatPrice(coin.price, coin.symbol)}`;
  };

  const renderSuggestionChange = (coin) => {
    if (coin.change24h == null || !Number.isFinite(Number(coin.change24h))) {
      return { text: '', className: 'volume' };
    }

    const numericChange = Number(coin.change24h);
    return {
      text: `${numericChange >= 0 ? '+' : ''}${numericChange.toFixed(2)}%`,
      className: numericChange >= 0 ? 'change-positive' : 'change-negative',
    };
  };

  const renderRow = (coin, action) => {
    const changeClass = coin.change24h >= 0 ? 'change-positive' : 'change-negative';
    const changeValue = `${coin.change24h >= 0 ? '+' : ''}${Number(coin.change24h || 0).toFixed(2)}%`;

    return (
      <li key={coin.id} className={action ? 'favorite-item' : 'crypto-item'}>
        <span className="symbol">{coin.symbol}</span>
        <span className="price">${formatPrice(coin.price, coin.symbol)}</span>
        <span className={changeClass}>{changeValue}</span>
        <span className="volume">{coin.volume || 'N/A'}</span>
        {action ? action(coin) : null}
      </li>
    );
  };

  return (
    <main className="container">
      <header className="page-header">
        <h1>CryptoTracker</h1>
        <p className="subtitle">Ринок у реальному часі</p>
        <p className="env-status">Mode: {envStatus}</p>
        <p className="env-status">Live stream: {streamStatus}</p>
        {lastUpdated ? (
          <p className="env-status">Last update: {lastUpdated.toLocaleTimeString('uk-UA')}</p>
        ) : null}
        {marketNotice ? <p className="market-notice">{marketNotice}</p> : null}
      </header>

      <section className="search-wrapper" aria-label="Пошук криптовалют">
        <div className="search-box">
          <input
            type="text"
            id="tickerInput"
            value={query}
            onChange={handleQueryChange}
            placeholder="Шукайте монету (BTC, ETH, SOL...)"
            autoComplete="off"
          />
        </div>

        {suggestionVisible ? (
          <div className="search-suggestions" id="suggestions">
            {isLoadingSuggestions && !suggestions.length ? (
              <div className="suggestion-item">Завантаження...</div>
            ) : hasResolvedSearch && !suggestions.length ? (
              <div className="suggestion-item">{searchNotice || 'Нічого не знайдено'}</div>
            ) : (
              suggestions.map((coin) => {
                const suggestionChange = renderSuggestionChange(coin);
                const suggestionName = renderSuggestionName(coin);

                return (
                  <button
                    key={coin.id}
                    type="button"
                    className="suggestion-item"
                    onClick={() => addToWatchlist(coin)}
                  >
                    <span className="suggestion-left">
                      <span className="suggestion-symbol">{coin.symbol}</span>
                      {suggestionName ? <span className="suggestion-name">{suggestionName}</span> : null}
                    </span>
                    <span className="suggestion-right">
                      <span className="price suggestion-price">{renderSuggestionPrice(coin)}</span>
                      <span className={suggestionChange.className}>{suggestionChange.text}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        ) : null}
      </section>

      <section className="top-10-section">
        <h2>Топ 10 монет по 24h обсягу</h2>
        <div className="crypto-table">
          <div className="table-header table-header-4">
            <span>Токен</span>
            <span>Ціна (USD)</span>
            <span>Зміна 24h</span>
            <span>Обсяг (24h)</span>
          </div>
          <ul id="top10List" className="list">
            {top10.map((coin) => renderRow(coin))}
          </ul>
        </div>
      </section>

      <section className="my-tokens-section">
        <h2>Мої токени</h2>
        <div className="crypto-table">
          <div className="table-header table-header-5">
            <span>Токен</span>
            <span>Ціна (USD)</span>
            <span>Зміна 24h</span>
            <span>Обсяг (24h)</span>
            <span>Дія</span>
          </div>
          <ul id="cryptoList" className="list">
            {watchlist.map((coin) =>
              renderRow(coin, (item) => (
                <span>
                  <button
                    type="button"
                    className="add-to-favorites-btn"
                    onClick={() => addToFavorites(item)}
                    title="Додати в обрані"
                  >
                    ⭐
                  </button>
                  <button
                    type="button"
                    className="remove-btn"
                    onClick={() => removeFromWatchlist(item.id)}
                    title="Видалити з моїх токенів"
                  >
                    ✕
                  </button>
                </span>
              ))
            )}
          </ul>
        </div>
      </section>

      <section className="favorites-section">
        <h2>Обрані токени</h2>
        <div className="crypto-table">
          <div className="favorites-header table-header-5">
            <span>Токен</span>
            <span>Ціна (USD)</span>
            <span>Зміна 24h</span>
            <span>Обсяг (24h)</span>
            <span>Дія</span>
          </div>
          <ul id="favoritesList" className="list">
            {favorites.map((coin) =>
              renderRow(coin, (item) => (
                <button
                  type="button"
                  className="remove-btn"
                  onClick={() => removeFromFavorites(item.id)}
                  title="Видалити з обраних"
                >
                  ✕
                </button>
              ))
            )}
          </ul>
        </div>
      </section>
    </main>
  );
}

export default App;