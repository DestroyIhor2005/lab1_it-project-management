import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchBinanceOrderBook,
  fetchBinanceKlines,
  fetchCoinsSnapshot,
  getBinanceTickerSymbol,
  getTop10ByVolume,
  prefetchCoinsDirectory,
  searchCoins,
  searchCoinCandidatesLocally,
  subscribeToBinanceTickers,
} from './api.js';

const WATCHLIST_KEY = 'cryptoWatchlist';
const FAVORITES_KEY = 'cryptoFavorites';
const TOP10_CACHE_KEY = 'cryptoTop10Cache';
const TOP10_CACHE_TIME_KEY = 'cryptoTop10CacheTime';
const SEARCH_CACHE_KEY = 'cryptoSearchSuggestionsCacheV7';
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const CHART_CACHE_TTL_MS = 60 * 1000;
const MAX_CHART_POINTS = 320;
const CHART_AXIS_GUTTER = 104;
const CHART_AXIS_GAP = 12;
const ORDER_BOOK_LIMIT = 11;
const CHART_SVG_WIDTH = 1480;
const CHART_SVG_HEIGHT = 760;
const CHART_MODE_OPTIONS = [
  { label: 'Line', value: 'line' },
  { label: 'Candles', value: 'candles' },
];
const CHART_TIMEFRAME_OPTIONS = [
  { label: '1m', value: '1m', seconds: 60 },
  { label: '5m', value: '5m', seconds: 300 },
  { label: '15m', value: '15m', seconds: 900 },
  { label: '30m', value: '30m', seconds: 1800 },
  { label: '1h', value: '1h', seconds: 3600 },
  { label: '1d', value: '1d', seconds: 86400 },
  { label: '1w', value: '1w', seconds: 604800 },
];
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

const formatChartTimestamp = (timestamp, timeframeSeconds) => {
  const date = new Date(timestamp);
  if (timeframeSeconds <= 3600) {
    return date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
  }

  return date.toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const buildChartLineGeometry = (
  points,
  width = CHART_SVG_WIDTH,
  height = CHART_SVG_HEIGHT,
  padding = 28
) => {
  if (!Array.isArray(points) || points.length < 2) {
    return null;
  }

  const prices = points.map((point) => point.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const startTime = points[0].timestamp;
  const endTime = points[points.length - 1].timestamp;

  const xSpan = Math.max(endTime - startTime, 1);
  const fallbackPriceSpan = Math.max(minPrice * 0.002, 0.0001);
  const ySpan = Math.max(maxPrice - minPrice, fallbackPriceSpan);

  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;

  const coordinates = points.map((point) => {
    const x = padding + ((point.timestamp - startTime) / xSpan) * usableWidth;
    const y = height - padding - ((point.price - minPrice) / ySpan) * usableHeight;
    return { x, y };
  });

  return {
    width,
    height,
    padding,
    polyline: coordinates.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' '),
    first: coordinates[0],
    last: coordinates[coordinates.length - 1],
    startTime,
    endTime,
    minPrice,
    maxPrice,
  };
};

const buildCandlestickGeometry = (
  candles,
  width = CHART_SVG_WIDTH,
  height = CHART_SVG_HEIGHT,
  padding = 28,
  axisGutter = CHART_AXIS_GUTTER,
  axisGap = CHART_AXIS_GAP
) => {
  if (!Array.isArray(candles) || candles.length < 2) {
    return null;
  }

  const lowValues = candles.map((candle) => candle.low);
  const highValues = candles.map((candle) => candle.high);
  const minPrice = Math.min(...lowValues);
  const maxPrice = Math.max(...highValues);

  const fallbackPriceSpan = Math.max(minPrice * 0.002, 0.0001);
  const ySpan = Math.max(maxPrice - minPrice, fallbackPriceSpan);
  const plotStartX = padding;
  const plotEndX = width - padding - axisGutter - axisGap;
  const axisStartX = plotEndX + axisGap;
  const axisEndX = width - 4;
  const usableWidth = Math.max(1, plotEndX - plotStartX);
  const usableHeight = height - padding * 2;
  const step = usableWidth / Math.max(candles.length, 1);
  const bodyWidth = Math.max(3, Math.min(18, step * 0.65));

  const toY = (price) => height - padding - ((price - minPrice) / ySpan) * usableHeight;

  return {
    width,
    height,
    axisStartX,
    axisEndX,
    startTime: candles[0].start,
    endTime: candles[candles.length - 1].end,
    minPrice,
    maxPrice,
    candles: candles.map((candle, index) => {
      const xCenter = plotStartX + step * index + step / 2;
      const yOpen = toY(candle.open);
      const yClose = toY(candle.close);
      const yHigh = toY(candle.high);
      const yLow = toY(candle.low);

      return {
        xCenter,
        bodyX: xCenter - bodyWidth / 2,
        bodyWidth,
        bodyY: Math.min(yOpen, yClose),
        bodyHeight: Math.max(1.5, Math.abs(yClose - yOpen)),
        wickHighY: yHigh,
        wickLowY: yLow,
        isUp: candle.close >= candle.open,
      };
    }),
  };
};

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
  const [chartCoin, setChartCoin] = useState(null);
  const [chartTimeframe, setChartTimeframe] = useState('1m');
  const [chartMode, setChartMode] = useState('line');
  const [chartKlines, setChartKlines] = useState([]);
  const [isChartLoading, setIsChartLoading] = useState(false);
  const [chartError, setChartError] = useState('');
  const [chartLivePrice, setChartLivePrice] = useState(null);
  const [orderBook, setOrderBook] = useState({ bids: [], asks: [] });
  const [isOrderBookLoading, setIsOrderBookLoading] = useState(false);
  const [orderBookError, setOrderBookError] = useState('');
  const top10Ref = useRef([]);
  const watchlistRef = useRef([]);
  const favoritesRef = useRef([]);
  const searchCacheRef = useRef({});
  const knownSuggestionsRef = useRef({});
  const chartCacheRef = useRef({});

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
  const chartPoints = useMemo(
    () => chartKlines.map((kline) => ({ timestamp: kline.time * 1000, price: kline.close })),
    [chartKlines]
  );
  const chartGeometry = useMemo(
    () => buildChartLineGeometry(chartPoints),
    [chartPoints]
  );
  const chartSelectedTimeframe = useMemo(
    () => CHART_TIMEFRAME_OPTIONS.find((option) => option.value === chartTimeframe) || CHART_TIMEFRAME_OPTIONS[0],
    [chartTimeframe]
  );
  const chartCandles = useMemo(
    () => chartKlines.map((kline) => ({
      start: kline.time * 1000,
      end: (kline.time + chartSelectedTimeframe.seconds) * 1000,
      open: kline.open,
      high: kline.high,
      low: kline.low,
      close: kline.close,
    })),
    [chartKlines, chartSelectedTimeframe.seconds]
  );
  const candleGeometry = useMemo(
    () => buildCandlestickGeometry(chartCandles),
    [chartCandles]
  );
  const chartLastPriceLine = useMemo(() => {
    if (!candleGeometry?.candles?.length || !chartCandles.length) {
      return null;
    }

    const lastDataCandle = chartCandles[chartCandles.length - 1];
    const previousDataCandle = chartCandles[chartCandles.length - 2] || null;

    const linePrice = Number.isFinite(Number(chartLivePrice))
      ? Number(chartLivePrice)
      : lastDataCandle.close;
    const priceSpan = Math.max(candleGeometry.maxPrice - candleGeometry.minPrice, 0.0001);
    const normalizedY = candleGeometry.height
      - 24
      - ((linePrice - candleGeometry.minPrice) / priceSpan) * (candleGeometry.height - 48);
    const closeY = Math.min(candleGeometry.height - 8, Math.max(8, normalizedY));

    const lineColor = linePrice >= (previousDataCandle?.close ?? lastDataCandle.open)
      ? '#56d7a5'
      : '#ff7f7f';
    const axisWidth = Math.max(1, candleGeometry.axisEndX - candleGeometry.axisStartX);
    const labelPadding = 7;
    const labelWidthFinal = Math.max(1, axisWidth - labelPadding * 2);
    const labelXFinal = candleGeometry.axisStartX + labelPadding;
    const labelHeight = 34;
    const labelY = Math.min(
      candleGeometry.height - labelHeight - 6,
      Math.max(6, closeY - labelHeight / 2)
    );

    return {
      y: closeY,
      xStart: 14,
      xEnd: candleGeometry.axisStartX - 6,
      labelX: labelXFinal,
      labelY,
      labelWidth: labelWidthFinal,
      labelHeight,
      color: lineColor,
      value: linePrice,
    };
  }, [candleGeometry, chartCandles, chartLivePrice]);
  const chartLastPriceDashSegments = useMemo(() => {
    if (!chartLastPriceLine) {
      return [];
    }

    const segments = [];
    const dashLength = 10;
    const gapLength = 8;
    const cycle = dashLength + gapLength;
    const maxX = chartLastPriceLine.xEnd;

    for (let start = chartLastPriceLine.xStart; start + dashLength <= maxX; start += cycle) {
      segments.push({
        x1: start,
        x2: start + dashLength,
      });
    }

    return segments;
  }, [chartLastPriceLine]);
  const chartCurrentPrice = useMemo(() => {
    if (Number.isFinite(Number(chartLivePrice))) {
      return Number(chartLivePrice);
    }

    const latestPointPrice = chartKlines[chartKlines.length - 1]?.close;
    if (Number.isFinite(Number(latestPointPrice))) {
      return Number(latestPointPrice);
    }

    if (Number.isFinite(Number(chartCoin?.price))) {
      return Number(chartCoin.price);
    }

    return null;
  }, [chartCoin?.price, chartKlines, chartLivePrice]);
  const chartChangePercent = useMemo(() => {
    if (!chartKlines.length) {
      return null;
    }

    const startPrice = Number(chartKlines[0]?.open);
    const endPrice = Number(chartKlines[chartKlines.length - 1]?.close);

    if (!Number.isFinite(startPrice) || !Number.isFinite(endPrice) || !startPrice) {
      return null;
    }

    return ((endPrice - startPrice) / startPrice) * 100;
  }, [chartKlines]);
  const isChartCoinFavorite = useMemo(
    () => favorites.some((coin) => coin.id === chartCoin?.id),
    [chartCoin?.id, favorites]
  );
  const chartCoinDisplayName = useMemo(() => {
    const normalizedSymbol = normalizeLabel(chartCoin?.symbol);
    const normalizedName = normalizeLabel(chartCoin?.name);

    if (normalizedName && normalizedName !== normalizedSymbol) {
      return chartCoin?.name || '';
    }

    return chartCoin?.name || chartCoin?.symbol || '';
  }, [chartCoin?.name, chartCoin?.symbol]);
  const orderBookAsks = useMemo(
    () => [...(orderBook.asks || [])].slice(0, ORDER_BOOK_LIMIT).reverse(),
    [orderBook.asks]
  );
  const orderBookBids = useMemo(
    () => [...(orderBook.bids || [])].slice(0, ORDER_BOOK_LIMIT),
    [orderBook.bids]
  );
  const orderBookMaxTotal = useMemo(() => {
    const totals = [...orderBookAsks, ...orderBookBids].map((level) => Number(level.total) || 0);
    return Math.max(1, ...totals);
  }, [orderBookAsks, orderBookBids]);
  const orderBookMidPrice = useMemo(() => {
    const bestAsk = Number(orderBook.asks?.[0]?.price);
    const bestBid = Number(orderBook.bids?.[0]?.price);

    if (Number.isFinite(bestAsk) && Number.isFinite(bestBid)) {
      return (bestAsk + bestBid) / 2;
    }

    if (Number.isFinite(Number(chartCurrentPrice))) {
      return Number(chartCurrentPrice);
    }

    return null;
  }, [chartCurrentPrice, orderBook.asks, orderBook.bids]);

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

    // Швидкий шлях: одразу показуємо монети з локального кешу (без мережевих запитів)
    if (!fallbackSuggestions.length) {
      searchCoinCandidatesLocally(trimmed).then((localCandidates) => {
        if (ignore || !localCandidates.length) return;
        setSuggestions(enrichSuggestionsWithKnownData(localCandidates, knownSuggestionsRef.current));
      });
    }

    const timer = setTimeout(async () => {
      try {
        const results = await searchCoins(trimmed);
        if (ignore) return;

        const enrichedResults = enrichSuggestionsWithKnownData(results, knownSuggestionsRef.current);
        const pricedResults = getPricedSuggestions(enrichedResults);
        const hasAnyResults = enrichedResults.length > 0;

        if (pricedResults.length) {
          knownSuggestionsRef.current = persistKnownSuggestions(knownSuggestionsRef.current, pricedResults);
        }

        if (hasAnyResults) {
          const normalizedQuery = normalizeSearchQuery(trimmed);
          const nextCache = {
            ...searchCacheRef.current,
            [normalizedQuery]: {
              timestamp: Date.now(),
              results: enrichedResults,
            },
          };

          searchCacheRef.current = nextCache;
          persistSearchCache(nextCache);

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
        setSuggestions((currentList) => applyLiveTickerUpdate(currentList, ticker));
        setLastUpdated(new Date());
      },
    });

    return () => {
      unsubscribe();
    };
  }, [trackedSymbols]);

  useEffect(() => {
    if (!chartCoin?.id) {
      return;
    }

    let ignore = false;
    const chartSymbol = String(chartCoin.symbol || '').toUpperCase();
    const cacheKey = `${chartSymbol}:${chartTimeframe}`;
    const cachedEntry = chartCacheRef.current[cacheKey];
    const hasFreshCache = cachedEntry && Date.now() - cachedEntry.timestamp <= CHART_CACHE_TTL_MS;

    if (hasFreshCache) {
      setChartKlines(cachedEntry.klines);
      setChartError('');
    }

    const loadChart = async () => {
      if (!hasFreshCache) {
        setIsChartLoading(true);
      }

      try {
        const klines = await fetchBinanceKlines(chartSymbol, chartSelectedTimeframe.value, 220);
        if (ignore) return;

        if (!klines.length) {
          setChartError('Не вдалося отримати історію ціни для графіка.');
          if (!hasFreshCache) {
            setChartKlines([]);
          }
          return;
        }

        chartCacheRef.current[cacheKey] = {
          timestamp: Date.now(),
          klines,
        };

        setChartKlines(klines);
        setChartError('');
        setChartLivePrice(klines[klines.length - 1]?.close ?? null);
      } catch {
        if (ignore) return;
        setChartError('Помилка при завантаженні графіка.');
      } finally {
        if (!ignore) {
          setIsChartLoading(false);
        }
      }
    };

    loadChart();

    return () => {
      ignore = true;
    };
  }, [chartCoin?.id, chartCoin?.symbol, chartSelectedTimeframe.value, chartTimeframe]);

  useEffect(() => {
    if (!chartCoin?.symbol) {
      return;
    }

    const chartSymbol = String(chartCoin.symbol).toUpperCase();
    if (!getBinanceTickerSymbol(chartSymbol)) {
      return;
    }

    const unsubscribe = subscribeToBinanceTickers([chartSymbol], {
      onTicker: (ticker) => {
        if (ticker.symbol !== chartSymbol || !Number.isFinite(Number(ticker.price))) {
          return;
        }

        const livePrice = Number(ticker.price);
        setChartLivePrice(livePrice);

        setChartKlines((currentKlines) => {
          const bucketSizeSeconds = chartSelectedTimeframe.seconds;
          const currentBucketTime = Math.floor(Date.now() / 1000 / bucketSizeSeconds) * bucketSizeSeconds;

          if (!currentKlines.length) {
            return [{
              time: currentBucketTime,
              open: livePrice,
              high: livePrice,
              low: livePrice,
              close: livePrice,
            }];
          }

          const nextKlines = [...currentKlines];
          const lastKline = nextKlines[nextKlines.length - 1];

          if (lastKline.time === currentBucketTime) {
            nextKlines[nextKlines.length - 1] = {
              ...lastKline,
              high: Math.max(lastKline.high, livePrice),
              low: Math.min(lastKline.low, livePrice),
              close: livePrice,
            };
          } else if (currentBucketTime > lastKline.time) {
            nextKlines.push({
              time: currentBucketTime,
              open: lastKline.close,
              high: Math.max(lastKline.close, livePrice),
              low: Math.min(lastKline.close, livePrice),
              close: livePrice,
            });
          }

          if (nextKlines.length > MAX_CHART_POINTS) {
            nextKlines.splice(0, nextKlines.length - MAX_CHART_POINTS);
          }

          return nextKlines;
        });
      },
    });

    return () => {
      unsubscribe();
    };
  }, [chartCoin?.symbol, chartSelectedTimeframe.seconds]);

  useEffect(() => {
    if (!chartCoin?.symbol) {
      return;
    }

    let ignore = false;

    const loadOrderBook = async () => {
      const nextOrderBook = await fetchBinanceOrderBook(chartCoin.symbol, ORDER_BOOK_LIMIT);
      if (ignore) {
        return;
      }

      if (nextOrderBook.bids.length || nextOrderBook.asks.length) {
        setOrderBook(nextOrderBook);
        setOrderBookError('');
        return;
      }

      setOrderBookError('Не вдалося завантажити книгу ордерів.');
    };

    setIsOrderBookLoading(true);
    loadOrderBook().finally(() => {
      if (!ignore) {
        setIsOrderBookLoading(false);
      }
    });

    const intervalId = window.setInterval(loadOrderBook, 2500);

    return () => {
      ignore = true;
      window.clearInterval(intervalId);
    };
  }, [chartCoin?.symbol]);

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

  const addToFavorites = (coin) => {
    setFavorites((prev) => {
      if (prev.some((item) => item.id === coin.id)) return prev;
      return [coin, ...prev];
    });
  };

  const openSuggestionChart = (coin) => {
    setQuery('');
    setSuggestions([]);
    openCoinChart(coin);
  };

  const removeFromFavorites = (coinId) => {
    setFavorites((prev) => prev.filter((coin) => coin.id !== coinId));
  };

  const openCoinChart = (coin) => {
    setChartCoin(coin);
    setChartTimeframe('1m');
    setChartMode('candles');
    setChartError('');
    setChartKlines([]);
    setChartLivePrice(Number.isFinite(Number(coin?.price)) ? Number(coin.price) : null);
    setOrderBook({ bids: [], asks: [] });
    setOrderBookError('');
  };

  const closeCoinChart = () => {
    setChartCoin(null);
    setChartTimeframe('1m');
    setChartMode('line');
    setChartError('');
    setChartKlines([]);
    setChartLivePrice(null);
    setOrderBook({ bids: [], asks: [] });
    setOrderBookError('');
  };
  const toggleChartCoinFavorite = () => {
    if (!chartCoin?.id) {
      return;
    }

    if (isChartCoinFavorite) {
      removeFromFavorites(chartCoin.id);
      return;
    }

    addToFavorites(chartCoin);
  };

  const formatOrderBookAmount = (value) => {
    const numericValue = Number(value || 0);

    if (numericValue >= 100) {
      return numericValue.toLocaleString('uk-UA', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }

    if (numericValue >= 1) {
      return numericValue.toLocaleString('uk-UA', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
      });
    }

    return numericValue.toLocaleString('uk-UA', {
      minimumFractionDigits: 4,
      maximumFractionDigits: 8,
    });
  };

  const formatOrderBookTotal = (value) => {
    const numericValue = Number(value || 0);

    return numericValue.toLocaleString('uk-UA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: numericValue >= 1 ? 2 : 6,
    });
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
    const isFavorite = favorites.some((item) => item.id === coin.id);

    return (
      <li key={coin.id} className={action ? 'favorite-item' : 'crypto-item'}>
        <span className="token-cell">
          <button
            type="button"
            className={`row-favorite-btn${isFavorite ? ' active' : ''}`}
            onClick={() => {
              if (isFavorite) {
                removeFromFavorites(coin.id);
                return;
              }

              addToFavorites(coin);
            }}
            title={isFavorite ? 'Прибрати з обраних' : 'Додати в обрані'}
            aria-label={isFavorite ? 'Прибрати з обраних' : 'Додати в обрані'}
          >
            {isFavorite ? '★' : '☆'}
          </button>
          <button
            type="button"
            className="token-chart-trigger"
            onClick={() => openCoinChart(coin)}
            title="Відкрити графік монети"
          >
            {coin.image ? <img className="coin-icon" src={coin.image} alt={coin.symbol} loading="lazy" /> : null}
            <span className="token-meta">
              <span className="symbol">{coin.symbol}</span>
              {renderSuggestionName(coin) ? <span className="coin-name">{renderSuggestionName(coin)}</span> : null}
            </span>
          </button>
        </span>
        <span className="price">${formatPrice(coin.price, coin.symbol)}</span>
        <span className={changeClass}>{changeValue}</span>
        <span className="volume">{coin.volume || 'N/A'}</span>
        {action ? <span className="row-actions">{action(coin)}</span> : null}
      </li>
    );
  };

  if (chartCoin) {
    return (
      <main className="trade-page">
        <header className="trade-page-header">
          <button type="button" className="trade-back-btn" onClick={closeCoinChart}>Повернутись до списку</button>
        </header>

        <div className="trade-layout">
          <section className="trade-chart-panel">
            <div className="trade-chart-head">
              <div className="trade-asset-summary">
                <button
                  type="button"
                  className={`trade-favorite-btn${isChartCoinFavorite ? ' active' : ''}`}
                  onClick={toggleChartCoinFavorite}
                  title={isChartCoinFavorite ? 'Прибрати з обраних' : 'Додати в обрані'}
                  aria-label={isChartCoinFavorite ? 'Прибрати з обраних' : 'Додати в обрані'}
                >
                  {isChartCoinFavorite ? '★' : '☆'}
                </button>
                {chartCoin.image ? (
                  <img className="trade-coin-icon" src={chartCoin.image} alt={chartCoin.symbol} loading="lazy" />
                ) : null}
                <div className="trade-asset-copy">
                  <div className="trade-pair-label">{chartCoin.symbol}/USDT</div>
                  <div className="trade-asset-name">{chartCoinDisplayName}</div>
                </div>
              </div>

              <div className="trade-head-divider" aria-hidden="true" />

              <div className="trade-price-summary">
                <div className="trade-price-row">
                  <span className="trade-price-primary">
                    {chartCurrentPrice == null ? 'N/A' : `$${formatPrice(chartCurrentPrice, chartCoin.symbol)}`}
                  </span>
                  {chartChangePercent != null ? (
                    <span className={`trade-price-change ${chartChangePercent >= 0 ? 'change-positive' : 'change-negative'}`}>
                      {chartChangePercent >= 0 ? '+' : ''}{chartChangePercent.toFixed(2)}%
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="chart-mode-switcher">
              {CHART_MODE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`chart-mode-btn${chartMode === option.value ? ' active' : ''}`}
                  onClick={() => setChartMode(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="chart-interval-switcher">
              {CHART_TIMEFRAME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`chart-interval-btn${chartTimeframe === option.value ? ' active' : ''}`}
                  onClick={() => setChartTimeframe(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {isChartLoading ? <p className="chart-state">Завантаження графіка...</p> : null}
            {!isChartLoading && chartError ? <p className="chart-state chart-state-error">{chartError}</p> : null}

            {!isChartLoading && !chartError && chartMode === 'line' && chartGeometry ? (
              <div className="chart-canvas">
                <svg viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`} className="chart-svg" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="chartLineGradient" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#58c5ff" />
                      <stop offset="100%" stopColor="#9dffca" />
                    </linearGradient>
                  </defs>
                  <polyline
                    fill="none"
                    stroke="url(#chartLineGradient)"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={chartGeometry.polyline}
                  />
                  <circle cx={chartGeometry.last.x} cy={chartGeometry.last.y} r="5" fill="#ffffff" />
                </svg>
              </div>
            ) : null}

            {!isChartLoading && !chartError && chartMode === 'candles' && candleGeometry ? (
              <div className="chart-canvas">
                <svg viewBox={`0 0 ${candleGeometry.width} ${candleGeometry.height}`} className="chart-svg" preserveAspectRatio="none">
                  {candleGeometry.candles.map((candle, index) => (
                    <g key={`candle-${index}`}>
                      <line
                        x1={candle.xCenter}
                        y1={candle.wickHighY}
                        x2={candle.xCenter}
                        y2={candle.wickLowY}
                        stroke={candle.isUp ? '#56d7a5' : '#ff7f7f'}
                        strokeWidth="1.6"
                      />
                      <rect
                        x={candle.bodyX}
                        y={candle.bodyY}
                        width={candle.bodyWidth}
                        height={candle.bodyHeight}
                        rx="1.5"
                        fill={candle.isUp ? '#56d7a5' : '#ff7f7f'}
                      />
                    </g>
                  ))}
                  <line
                    x1={candleGeometry.axisStartX}
                    y1="0"
                    x2={candleGeometry.axisStartX}
                    y2={candleGeometry.height}
                    stroke="#27476f"
                    strokeWidth="1"
                    opacity="0.9"
                  />
                  {chartLastPriceLine ? (
                    <>
                      {chartLastPriceDashSegments.map((segment, index) => (
                        <line
                          key={`price-dash-${index}`}
                          x1={segment.x1}
                          y1={chartLastPriceLine.y}
                          x2={segment.x2}
                          y2={chartLastPriceLine.y}
                          stroke={chartLastPriceLine.color}
                          strokeWidth="1.8"
                          strokeLinecap="butt"
                          opacity="0.94"
                        />
                      ))}
                      <rect
                        x={chartLastPriceLine.labelX}
                        y={chartLastPriceLine.labelY}
                        width={chartLastPriceLine.labelWidth}
                        height={chartLastPriceLine.labelHeight}
                        rx="2"
                        fill="#163252"
                        stroke={chartLastPriceLine.color}
                        strokeWidth="1.2"
                        opacity="0.96"
                      />
                      <text
                        x={chartLastPriceLine.labelX + chartLastPriceLine.labelWidth / 2}
                        y={chartLastPriceLine.labelY + chartLastPriceLine.labelHeight / 2 + 0.5}
                        fill="#ffffff"
                        fontSize="18"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontWeight="800"
                      >
                        ${formatPrice(chartLastPriceLine.value, chartCoin.symbol)}
                      </text>
                    </>
                  ) : null}
                </svg>
              </div>
            ) : null}

            {!isChartLoading && !chartError && chartMode === 'line' && !chartGeometry ? (
              <p className="chart-state">Недостатньо даних для побудови графіка.</p>
            ) : null}

            {!isChartLoading && !chartError && chartMode === 'candles' && !candleGeometry ? (
              <p className="chart-state">Недостатньо даних для побудови графіка.</p>
            ) : null}
          </section>

          <aside className="orderbook-panel">
            <div className="orderbook-header">
              <h3>Книга ордерів</h3>
              <span>{chartCoin.symbol}/USDT</span>
            </div>

            <div className="orderbook-columns">
              <span>Ціна (USDT)</span>
              <span>Сума ({chartCoin.symbol})</span>
              <span>Всього (USDT)</span>
            </div>

            {isOrderBookLoading ? <p className="orderbook-state">Завантаження...</p> : null}
            {!isOrderBookLoading && orderBookError ? <p className="orderbook-state orderbook-state-error">{orderBookError}</p> : null}

            <ul className="orderbook-list orderbook-list-asks">
              {orderBookAsks.map((level, index) => (
                <li key={`ask-${level.price}-${index}`} className="orderbook-row orderbook-row-ask">
                  <i className="orderbook-row-fill" style={{ width: `${Math.min(100, (level.total / orderBookMaxTotal) * 100)}%` }} />
                  <span className="orderbook-price orderbook-price-ask">{formatPrice(level.price, chartCoin.symbol)}</span>
                  <span>{formatOrderBookAmount(level.quantity)}</span>
                  <span>{formatOrderBookTotal(level.total)}</span>
                </li>
              ))}
            </ul>

            <div className="orderbook-row orderbook-mid-price">
              <span className="orderbook-price orderbook-mid-price-value">
                {orderBookMidPrice == null ? 'N/A' : formatPrice(orderBookMidPrice, chartCoin.symbol)}
              </span>
              <span />
              <span />
            </div>

            <ul className="orderbook-list orderbook-list-bids">
              {orderBookBids.map((level, index) => (
                <li key={`bid-${level.price}-${index}`} className="orderbook-row orderbook-row-bid">
                  <i className="orderbook-row-fill" style={{ width: `${Math.min(100, (level.total / orderBookMaxTotal) * 100)}%` }} />
                  <span className="orderbook-price orderbook-price-bid">{formatPrice(level.price, chartCoin.symbol)}</span>
                  <span>{formatOrderBookAmount(level.quantity)}</span>
                  <span>{formatOrderBookTotal(level.total)}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <header className="page-header">
        <span className="page-kicker">Digital Asset Intelligence</span>
        <h1>CryptoTracker</h1>
        <p className="subtitle">Ринок у реальному часі</p>
        <div className="status-grid">
          <p className="env-status">Mode: <strong>{envStatus}</strong></p>
          <p className="env-status">Live stream: <strong>{streamStatus}</strong></p>
          {lastUpdated ? (
            <p className="env-status">Last update: <strong>{lastUpdated.toLocaleTimeString('uk-UA')}</strong></p>
          ) : null}
        </div>
        {marketNotice ? <p className="market-notice">{marketNotice}</p> : null}
      </header>

      <section className="search-wrapper" aria-label="Пошук криптовалют">
        <label className="search-label" htmlFor="tickerInput">Пошук і відкриття монет</label>
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
                    onClick={() => openSuggestionChart(coin)}
                  >
                    <span className="suggestion-left">
                      {coin.image ? <img className="coin-icon" src={coin.image} alt={coin.symbol} loading="lazy" /> : null}
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
                  Видалити
                </button>
              ))
            )}
          </ul>
        </div>
      </section>

      {chartCoin ? (
        <div className="chart-modal-backdrop" onClick={closeCoinChart}>
          <div
            className="chart-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Графік ${chartCoin.symbol}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="chart-modal-header">
              <div>
                <p className="chart-modal-kicker">Live Price Chart</p>
                <h3>
                  {chartCoin.symbol}{renderSuggestionName(chartCoin) ? ` • ${renderSuggestionName(chartCoin)}` : ''}
                  {chartChangePercent != null ? (
                    <span className={`chart-title-change ${chartChangePercent >= 0 ? 'change-positive' : 'change-negative'}`}>
                      {' '}
                      {chartChangePercent >= 0 ? '+' : ''}{chartChangePercent.toFixed(2)}%
                    </span>
                  ) : null}
                </h3>
                <p className="chart-modal-price">
                  {chartCurrentPrice == null ? 'N/A' : `$${formatPrice(chartCurrentPrice, chartCoin.symbol)}`}
                </p>
              </div>
              <button type="button" className="chart-close-btn" onClick={closeCoinChart}>Закрити</button>
            </div>

            <div className="chart-mode-switcher">
              {CHART_MODE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`chart-mode-btn${chartMode === option.value ? ' active' : ''}`}
                  onClick={() => setChartMode(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="chart-interval-switcher">
              {CHART_TIMEFRAME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`chart-interval-btn${chartTimeframe === option.value ? ' active' : ''}`}
                  onClick={() => setChartTimeframe(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {isChartLoading ? <p className="chart-state">Завантаження графіка...</p> : null}
            {!isChartLoading && chartError ? <p className="chart-state chart-state-error">{chartError}</p> : null}

            {!isChartLoading && !chartError && chartMode === 'line' && chartGeometry ? (
              <>
                <div className="chart-canvas">
                  <svg viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`} className="chart-svg" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="chartLineGradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#58c5ff" />
                        <stop offset="100%" stopColor="#9dffca" />
                      </linearGradient>
                    </defs>
                    <polyline
                      fill="none"
                      stroke="url(#chartLineGradient)"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={chartGeometry.polyline}
                    />
                    <circle cx={chartGeometry.last.x} cy={chartGeometry.last.y} r="5" fill="#ffffff" />
                  </svg>
                </div>

              </>
            ) : null}

            {!isChartLoading && !chartError && chartMode === 'candles' && candleGeometry ? (
              <>
                <div className="chart-canvas">
                  <svg viewBox={`0 0 ${candleGeometry.width} ${candleGeometry.height}`} className="chart-svg" preserveAspectRatio="none">
                    {candleGeometry.candles.map((candle, index) => (
                      <g key={`candle-${index}`}>
                        <line
                          x1={candle.xCenter}
                          y1={candle.wickHighY}
                          x2={candle.xCenter}
                          y2={candle.wickLowY}
                          stroke={candle.isUp ? '#56d7a5' : '#ff7f7f'}
                          strokeWidth="1.6"
                        />
                        <rect
                          x={candle.bodyX}
                          y={candle.bodyY}
                          width={candle.bodyWidth}
                          height={candle.bodyHeight}
                          rx="1.5"
                          fill={candle.isUp ? '#56d7a5' : '#ff7f7f'}
                        />
                      </g>
                    ))}
                    <line
                      x1={candleGeometry.axisStartX}
                      y1="0"
                      x2={candleGeometry.axisStartX}
                      y2={candleGeometry.height}
                      stroke="#27476f"
                      strokeWidth="1"
                      opacity="0.9"
                    />
                    {chartLastPriceLine ? (
                      <>
                        {chartLastPriceDashSegments.map((segment, index) => (
                          <line
                            key={`price-dash-${index}`}
                            x1={segment.x1}
                            y1={chartLastPriceLine.y}
                            x2={segment.x2}
                            y2={chartLastPriceLine.y}
                            stroke={chartLastPriceLine.color}
                            strokeWidth="1.8"
                            strokeLinecap="butt"
                            opacity="0.94"
                          />
                        ))}
                        <rect
                          x={chartLastPriceLine.labelX}
                          y={chartLastPriceLine.labelY}
                          width={chartLastPriceLine.labelWidth}
                          height={chartLastPriceLine.labelHeight}
                          rx="4"
                          fill={chartLastPriceLine.color}
                          opacity="0.92"
                        />
                        <text
                          x={chartLastPriceLine.labelX + chartLastPriceLine.labelWidth / 2}
                          y={chartLastPriceLine.labelY + chartLastPriceLine.labelHeight / 2 + 0.5}
                          fill="#ffffff"
                          fontSize="10"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontWeight="700"
                        >
                          ${formatPrice(chartLastPriceLine.value, chartCoin.symbol)}
                        </text>
                      </>
                    ) : null}
                  </svg>
                </div>

              </>
            ) : null}

            {!isChartLoading && !chartError && chartMode === 'line' && !chartGeometry ? (
              <p className="chart-state">Недостатньо даних для побудови графіка.</p>
            ) : null}

            {!isChartLoading && !chartError && chartMode === 'candles' && !candleGeometry ? (
              <p className="chart-state">Недостатньо даних для побудови графіка.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default App;