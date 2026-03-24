const API_BASE = '/api/coingecko';
const BINANCE_API_BASE = '/api/binance';
const BINANCE_WS_BASE = 'wss://stream.binance.com:9443/stream?streams=';
const BINANCE_QUOTE_ASSET = 'USDT';
const BINANCE_UNSUPPORTED_SYMBOLS = new Set(['USDT', 'USDC', 'FDUSD', 'TUSD', 'BUSD', 'DAI', 'USDE', 'USDS']);
const MAX_SEARCH_CANDIDATES = 5;
const SEARCH_CANDIDATE_POOL_SIZE = 15;
const API_TIMEOUT_MS = 8000;
const COINS_DIRECTORY_CACHE_KEY = 'cryptoCoinsDirectoryCache';

let coinsDirectoryCache = null;

const readDirectoryCacheFromStorage = () => {
    if (typeof localStorage === 'undefined') {
        return null;
    }

    try {
        const rawValue = localStorage.getItem(COINS_DIRECTORY_CACHE_KEY);
        if (!rawValue) {
            return null;
        }

        const parsedValue = JSON.parse(rawValue);
        return Array.isArray(parsedValue) ? parsedValue : null;
    } catch {
        return null;
    }
};

const writeDirectoryCacheToStorage = (coins) => {
    if (typeof localStorage === 'undefined') {
        return;
    }

    try {
        localStorage.setItem(COINS_DIRECTORY_CACHE_KEY, JSON.stringify(coins));
    } catch {
        // Ignore transient storage failures for cache data.
    }
};

const mergeCoinsIntoDirectoryCache = (coins) => {
    const normalizedCoins = coins
        .map((coin) => ({
            id: coin?.id,
            name: coin?.name,
            symbol: coin?.symbol,
        }))
        .filter((coin) => coin.id && coin.name && coin.symbol);

    if (!normalizedCoins.length) {
        return;
    }

    const existingCoins = coinsDirectoryCache || readDirectoryCacheFromStorage() || [];
    const mergedCoins = new Map(existingCoins.map((coin) => [coin.id, coin]));

    normalizedCoins.forEach((coin) => {
        if (!mergedCoins.has(coin.id)) {
            mergedCoins.set(coin.id, coin);
        }
    });

    coinsDirectoryCache = [...mergedCoins.values()];
    writeDirectoryCacheToStorage(coinsDirectoryCache);
};

const resetApiCaches = () => {
    coinsDirectoryCache = null;
};

const prefetchCoinsDirectory = async () => {
    await getCoinsDirectory();
};

const requestJson = async (url) => {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), API_TIMEOUT_MS);

    try {
        const response = await fetch(url, { signal: abortController.signal });
        if (!response.ok) {
            const error = new Error(`HTTP ${response.status}`);
            error.status = response.status;
            throw error;
        }

        const clonedResponse = typeof response.clone === 'function' ? response.clone() : null;

        try {
            return await response.json();
        } catch (error) {
            const nextError = new Error(error?.message || 'Invalid JSON response');
            nextError.status = response.status;

            if (clonedResponse) {
                try {
                    nextError.responseText = await clonedResponse.text();
                } catch {
                    nextError.responseText = '';
                }
            }

            throw nextError;
        }
    } catch (error) {
        if (error?.name === 'AbortError') {
            const timeoutError = new Error('Request timeout');
            timeoutError.code = 'REQUEST_TIMEOUT';
            throw timeoutError;
        }

        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
};

const isRateLimitedError = (error) => {
    const message = String(error?.message || '');
    const responseText = String(error?.responseText || '');

    return error?.status === 429 || /rate limit|throttled/i.test(message) || /rate limit|throttled/i.test(responseText);
};

const formatBillions = (value) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return 'N/A';
    if (value >= 1e12) return `${(value / 1e12).toFixed(1)}T`;
    if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
    return value.toFixed(2);
};

const mapMarketCoin = (coin) => ({
    id: coin.id,
    name: coin.name,
    symbol: coin.symbol.toUpperCase(),
    image: coin.image || coin.large || '',
    price: coin.current_price,
    change24h: coin.price_change_percentage_24h ?? 0,
    volume: formatBillions(coin.total_volume),
    marketCapRank: coin.market_cap_rank ?? null,
});

const mapDetailedCoin = (coinId, data, metadata = {}) => {
    const marketData = data?.market_data;
    if (!marketData?.current_price?.usd) {
        return null;
    }

    return {
        id: coinId,
        name: metadata.name || data?.name || coinId,
        symbol: (metadata.symbol || data?.symbol || coinId).toUpperCase(),
        image: metadata.image || data?.image?.large || data?.image?.small || '',
        price: marketData.current_price.usd,
        change24h: marketData.price_change_percentage_24h ?? 0,
        volume: formatBillions(marketData.total_volume?.usd),
        marketCap: formatBillions(marketData.market_cap?.usd),
        marketCapRank: metadata.marketCapRank ?? data?.market_cap_rank ?? null,
    };
};

const mapSearchCandidateCoin = (coin, metadata = {}) => ({
    id: coin.id,
    name: metadata.name || coin.name || coin.id,
    symbol: (metadata.symbol || coin.symbol || coin.id).toUpperCase(),
    image: metadata.image || coin.large || coin.thumb || coin.image || '',
    price: null,
    change24h: null,
    volume: 'N/A',
    marketCap: 'N/A',
    marketCapRank: metadata.marketCapRank ?? coin.market_cap_rank ?? null,
});

const getCoinsDirectory = async (options = {}) => {
    const { silent = false } = options;

    if (coinsDirectoryCache) {
        return coinsDirectoryCache;
    }

    const persistedDirectory = readDirectoryCacheFromStorage();
    if (persistedDirectory?.length) {
        coinsDirectoryCache = persistedDirectory;
        return coinsDirectoryCache;
    }

    try {
        const data = await requestJson(`${API_BASE}/coins/list?include_platform=false`);
        coinsDirectoryCache = Array.isArray(data) ? data : [];
        if (coinsDirectoryCache.length) {
            writeDirectoryCacheToStorage(coinsDirectoryCache);
        }
    } catch (error) {
        if (!silent) {
            console.error('Помилка при отриманні каталогу монет:', error);
        }
        coinsDirectoryCache = null;
        return [];
    }

    return coinsDirectoryCache;
};

const getCoinMarketCapRank = (coin) => {
    const rank = Number(coin?.market_cap_rank ?? coin?.marketCapRank);
    return Number.isFinite(rank) && rank > 0 ? rank : Number.POSITIVE_INFINITY;
};

const getCoinTextMatchScore = (query, coin) => {
    const normalizedQuery = query.trim().toLowerCase();
    const symbol = coin.symbol?.toLowerCase() || '';
    const name = coin.name?.toLowerCase() || '';
    const nameTokens = name.split(/[^a-z0-9]+/i).filter(Boolean);

    if (symbol === normalizedQuery && name === normalizedQuery) return 110;
    if (symbol === normalizedQuery) return 100;
    if (name === normalizedQuery) return 98;
    if (nameTokens.includes(normalizedQuery)) return 92;
    if (name.startsWith(normalizedQuery)) return 84;
    if (symbol.startsWith(normalizedQuery)) return 80;
    if (symbol.includes(normalizedQuery)) return 65;
    return 0;
};

const getCoinSearchScore = (query, coin) => {
    const textMatchScore = getCoinTextMatchScore(query, coin);
    const marketCapRank = getCoinMarketCapRank(coin);
    const binanceTickerSymbol = getBinanceTickerSymbol(coin?.symbol);
    const marketCapBonus = Number.isFinite(marketCapRank)
        ? Math.max(0, 60 - Math.min(marketCapRank, 3000) / 50)
        : 0;
    const binanceBonus = binanceTickerSymbol ? 5 : 0;

    return textMatchScore + marketCapBonus + binanceBonus;
};

const filterRelevantCoins = (query, coins) =>
    coins.filter((coin) => getCoinTextMatchScore(query, coin) > 0);

const rankCoinsByQuery = (query, coins) =>
    [...coins].sort((leftCoin, rightCoin) => {
        const leftScore = getCoinSearchScore(query, leftCoin);
        const rightScore = getCoinSearchScore(query, rightCoin);

        if (leftScore !== rightScore) {
            return rightScore - leftScore;
        }

        const leftMarketCapRank = getCoinMarketCapRank(leftCoin);
        const rightMarketCapRank = getCoinMarketCapRank(rightCoin);

        if (leftMarketCapRank !== rightMarketCapRank) {
            return leftMarketCapRank - rightMarketCapRank;
        }

        const leftSymbol = leftCoin.symbol?.toLowerCase() || '';
        const rightSymbol = rightCoin.symbol?.toLowerCase() || '';
        const leftName = leftCoin.name?.toLowerCase() || '';
        const rightName = rightCoin.name?.toLowerCase() || '';

        if (leftSymbol !== rightSymbol) {
            return leftSymbol.localeCompare(rightSymbol);
        }

        return leftName.localeCompare(rightName);
    });

const dedupeCoinsById = (coins) => {
    const uniqueCoins = new Map();

    coins.forEach((coin) => {
        if (!coin?.id || uniqueCoins.has(coin.id)) {
            return;
        }

        uniqueCoins.set(coin.id, coin);
    });

    return [...uniqueCoins.values()];
};

const findCoinsLocally = async (query, options = {}) => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];

    const { exactOnly = false, silent = false } = options;

    const directory = await getCoinsDirectory({ silent });
    return rankCoinsByQuery(query, directory
        .filter((coin) => {
            const symbol = coin.symbol?.toLowerCase() || '';
            const name = coin.name?.toLowerCase() || '';

            if (exactOnly) {
                return symbol === normalizedQuery || name === normalizedQuery;
            }

            if (symbol.includes(normalizedQuery)) return true;
            const nameWords = name.split(/[^a-z0-9]+/).filter(Boolean);
            return nameWords.some((w) => w.startsWith(normalizedQuery));
            })
            )
        .slice(0, SEARCH_CANDIDATE_POOL_SIZE);
};

const buildSimplePriceUrl = (coinIds) =>
    `${API_BASE}/simple/price?ids=${coinIds.join(',')}&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true`;

const buildMarketsByIdsUrl = (coinIds) =>
    `${API_BASE}/coins/markets?vs_currency=usd&ids=${coinIds.join(',')}&order=market_cap_desc&per_page=${Math.max(coinIds.length, 1)}&page=1&sparkline=false&price_change_percentage=24h`;

const getBinanceTickerSymbol = (symbol) => {
    const normalizedSymbol = symbol?.trim().toUpperCase();
    if (!normalizedSymbol || BINANCE_UNSUPPORTED_SYMBOLS.has(normalizedSymbol)) {
        return null;
    }

    return `${normalizedSymbol}${BINANCE_QUOTE_ASSET}`;
};

const getBinanceStreamName = (symbol) => {
    const tickerSymbol = getBinanceTickerSymbol(symbol);
    return tickerSymbol ? `${tickerSymbol.toLowerCase()}@ticker` : null;
};

const mapSimplePriceCoin = (coinId, coin, metadata = {}) => ({
    id: coinId,
    name: metadata.name || coinId,
    symbol: (metadata.symbol || coinId).toUpperCase(),
    image: metadata.image || '',
    price: coin.usd,
    change24h: coin.usd_24h_change ?? 0,
    volume: formatBillions(coin.usd_24h_vol),
    marketCap: formatBillions(coin.usd_market_cap),
    marketCapRank: metadata.marketCapRank ?? null,
});

const mapBinanceTickerCoin = (coin, ticker, metadata = {}) => ({
    id: coin.id,
    name: metadata.name || coin.name || coin.id,
    symbol: (metadata.symbol || coin.symbol || coin.id).toUpperCase(),
    image: metadata.image || coin.large || coin.image || '',
    price: Number(ticker.lastPrice),
    change24h: Number(ticker.priceChangePercent) || 0,
    volume: formatBillions(Number(ticker.quoteVolume)),
    marketCap: 'N/A',
    marketCapRank: metadata.marketCapRank ?? null,
});

const fetchBinance24hrTickers = async (tickerSymbols) => {
    if (!tickerSymbols.length) return [];

    try {
        const encoded = encodeURIComponent(JSON.stringify(tickerSymbols));
        const data = await requestJson(`${BINANCE_API_BASE}/ticker/24hr?symbols=${encoded}`);
        return Array.isArray(data) ? data.filter((t) => t?.symbol) : [];
    } catch {
        return [];
    }
};

const fetchBinanceOrderBook = async (symbol, limit = 16) => {
    const tickerSymbol = getBinanceTickerSymbol(symbol);
    if (!tickerSymbol) {
        return { bids: [], asks: [] };
    }

    try {
        const data = await requestJson(
            `${BINANCE_API_BASE}/depth?symbol=${encodeURIComponent(tickerSymbol)}&limit=${encodeURIComponent(limit)}`
        );

        const mapLevels = (levels) => (Array.isArray(levels) ? levels : [])
            .map((entry) => {
                if (!Array.isArray(entry) || entry.length < 2) {
                    return null;
                }

                const price = Number(entry[0]);
                const quantity = Number(entry[1]);

                if (!Number.isFinite(price) || !Number.isFinite(quantity) || quantity <= 0) {
                    return null;
                }

                    return { price, quantity, total: price * quantity };
            })
            .filter(Boolean);

        const bids = mapLevels(data?.bids).sort((left, right) => right.price - left.price);
        const asks = mapLevels(data?.asks).sort((left, right) => left.price - right.price);

        return { bids, asks };
    } catch (error) {
        console.error(`Помилка при отриманні Binance order book для ${symbol}:`, error);
        return { bids: [], asks: [] };
    }
};

const fetchBinanceKlines = async (symbol, interval = '1m', limit = 300) => {
    const tickerSymbol = getBinanceTickerSymbol(symbol);
    if (!tickerSymbol) {
        return [];
    }

    try {
        const data = await requestJson(
            `${BINANCE_API_BASE}/klines?symbol=${encodeURIComponent(tickerSymbol)}&interval=${encodeURIComponent(interval)}&limit=${encodeURIComponent(limit)}`
        );

        if (!Array.isArray(data)) {
            return [];
        }

        return data
            .map((entry) => {
                if (!Array.isArray(entry) || entry.length < 5) {
                    return null;
                }

                const openTimeMs = Number(entry[0]);
                const open = Number(entry[1]);
                const high = Number(entry[2]);
                const low = Number(entry[3]);
                const close = Number(entry[4]);

                if (
                    !Number.isFinite(openTimeMs)
                    || !Number.isFinite(open)
                    || !Number.isFinite(high)
                    || !Number.isFinite(low)
                    || !Number.isFinite(close)
                ) {
                    return null;
                }

                return {
                    time: Math.floor(openTimeMs / 1000),
                    open,
                    high,
                    low,
                    close,
                };
            })
            .filter(Boolean);
    } catch (error) {
        console.error(`Помилка при отриманні Binance klines для ${symbol}:`, error);
        return [];
    }
};

// Повертає тільки числову ціну (для простих сценаріїв/тестів)
const fetchCoinPrice = async (coinId) => {
    try {
        const data = await requestJson(
            `${API_BASE}/simple/price?ids=${coinId}&vs_currencies=usd`
        );
        return data?.[coinId]?.usd ?? null;
    } catch (error) {
        console.error('Помилка при отриманні ціни:', error);
        return null;
    }
};

const fetchCoinMarketChart = async (coinId, days = 1) => {
    if (!coinId) return [];

    try {
        const data = await requestJson(
            `${API_BASE}/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=usd&days=${encodeURIComponent(days)}`
        );

        const prices = Array.isArray(data?.prices) ? data.prices : [];
        return prices
            .map((entry) => {
                if (!Array.isArray(entry) || entry.length < 2) {
                    return null;
                }

                const timestamp = Number(entry[0]);
                const price = Number(entry[1]);

                if (!Number.isFinite(timestamp) || !Number.isFinite(price)) {
                    return null;
                }

                return { timestamp, price };
            })
            .filter(Boolean);
    } catch (error) {
        console.error(`Помилка при отриманні історії ціни для ${coinId}:`, error);
        return [];
    }
};

const fetchCoinMarketChartRange = async (coinId, fromTimestampSec, toTimestampSec) => {
    if (!coinId || !Number.isFinite(Number(fromTimestampSec)) || !Number.isFinite(Number(toTimestampSec))) {
        return [];
    }

    try {
        const data = await requestJson(
            `${API_BASE}/coins/${encodeURIComponent(coinId)}/market_chart/range?vs_currency=usd&from=${encodeURIComponent(fromTimestampSec)}&to=${encodeURIComponent(toTimestampSec)}`
        );

        const prices = Array.isArray(data?.prices) ? data.prices : [];
        return prices
            .map((entry) => {
                if (!Array.isArray(entry) || entry.length < 2) {
                    return null;
                }

                const timestamp = Number(entry[0]);
                const price = Number(entry[1]);

                if (!Number.isFinite(timestamp) || !Number.isFinite(price)) {
                    return null;
                }

                return { timestamp, price };
            })
            .filter(Boolean);
    } catch (error) {
        console.error(`Помилка при отриманні історії ціни (range) для ${coinId}:`, error);
        return [];
    }
};



const fetchCoinsSnapshot = async (coinIds, metadataById = {}, options = {}) => {
    if (!coinIds?.length) return [];

    const { silent = false, throwOnRateLimit = false } = options;

    try {
        const data = await requestJson(buildSimplePriceUrl(coinIds));

        return coinIds
            .map((coinId) => {
                const coin = data?.[coinId];
                if (!coin) return null;
                return mapSimplePriceCoin(coinId, coin, metadataById[coinId]);
            })
            .filter(Boolean);
    } catch (error) {
        if (throwOnRateLimit && isRateLimitedError(error)) {
            throw error;
        }

        if (!silent) {
            console.error('Помилка при пакетному отриманні даних монет:', error);
        }
        return [];
    }
};

const fetchBinanceCoinsSnapshot = async (coins, metadataById = {}) => {
    if (!coins?.length) return [];

    const coinsWithTickers = coins
        .map((coin) => ({ coin, tickerSymbol: getBinanceTickerSymbol(coin.symbol) }))
        .filter(({ tickerSymbol }) => tickerSymbol);

    if (!coinsWithTickers.length) return [];

    const uniqueTickerSymbols = [...new Set(coinsWithTickers.map(({ tickerSymbol }) => tickerSymbol))];
    const tickers = await fetchBinance24hrTickers(uniqueTickerSymbols);
    const tickersBySymbol = new Map(tickers.map((t) => [t.symbol, t]));

    return coinsWithTickers
        .map(({ coin, tickerSymbol }) => {
            const ticker = tickersBySymbol.get(tickerSymbol);
            if (!ticker) return null;
            return mapBinanceTickerCoin(coin, ticker, metadataById[coin.id]);
        })
        .filter(Boolean);
};

const fetchCoinMarketDetails = async (coinId, metadata = {}, options = {}) => {
    const { silent = false } = options;

    try {
        const data = await requestJson(
            `${API_BASE}/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`
        );
        return mapDetailedCoin(coinId, data, metadata);
    } catch (error) {
        if (!silent) {
            console.error(`Помилка при отриманні детальних даних монети ${coinId}:`, error);
        }
        return null;
    }
};

const getCoinsWithUniqueSymbols = (coins) => {
    const symbolCounts = coins.reduce((counts, coin) => {
        const normalizedSymbol = String(coin?.symbol || '').trim().toUpperCase();

        if (!normalizedSymbol) {
            return counts;
        }

        counts.set(normalizedSymbol, (counts.get(normalizedSymbol) || 0) + 1);
        return counts;
    }, new Map());

    return coins.filter((coin) => {
        const normalizedSymbol = String(coin?.symbol || '').trim().toUpperCase();
        return normalizedSymbol && symbolCounts.get(normalizedSymbol) === 1;
    });
};

const fetchCoinsMarketSnapshot = async (coinIds, metadataById = {}, options = {}) => {
    if (!coinIds?.length) return [];

    const { silent = false, throwOnRateLimit = false, includeDetails = true } = options;

    try {
        const marketCoins = await requestJson(buildMarketsByIdsUrl(coinIds));
        const mappedCoins = marketCoins.map((coin) => ({
            ...mapMarketCoin(coin),
            marketCap: formatBillions(coin.market_cap),
            image: coin.image || metadataById[coin.id]?.image || '',
        }));

        const mappedById = new Map(mappedCoins.map((coin) => [coin.id, coin]));
        const missingIds = coinIds.filter((coinId) => !mappedById.has(coinId));

        if (includeDetails && missingIds.length) {
            const missingCoins = await Promise.all(
                missingIds.map((coinId) => fetchCoinMarketDetails(coinId, metadataById[coinId]))
            );

            missingCoins.filter(Boolean).forEach((coin) => {
                mappedById.set(coin.id, coin);
            });
        }

        return coinIds
            .map((coinId) => mappedById.get(coinId) || null)
            .filter(Boolean);
    } catch (error) {
        if (throwOnRateLimit && isRateLimitedError(error)) {
            throw error;
        }

        if (!silent) {
            console.error('Помилка при отриманні ринкових даних монет:', error);
        }
        return [];
    }
};

const subscribeToBinanceTickers = (symbols, handlers = {}) => {
    const streamNames = [...new Set(symbols.map(getBinanceStreamName).filter(Boolean))];

    if (!streamNames.length) {
        handlers.onStatusChange?.('idle');
        return () => {};
    }

    let socket = null;
    let reconnectTimeoutId = null;
    let isDisposed = false;
    let hasConnected = false;

    const connect = () => {
        if (isDisposed) return;

        handlers.onStatusChange?.('connecting');
        socket = new WebSocket(`${BINANCE_WS_BASE}${streamNames.join('/')}`);

        socket.addEventListener('open', () => {
            hasConnected = true;
            handlers.onStatusChange?.('connected');
        });

        socket.addEventListener('message', (event) => {
            try {
                const payload = JSON.parse(event.data);
                const ticker = payload?.data;
                const fullSymbol = ticker?.s;
                if (!fullSymbol || !fullSymbol.endsWith(BINANCE_QUOTE_ASSET)) return;

                const baseSymbol = fullSymbol.slice(0, -BINANCE_QUOTE_ASSET.length);
                handlers.onTicker?.({
                    symbol: baseSymbol,
                    price: Number(ticker.c),
                    change24h: Number(ticker.P),
                });
            } catch (error) {
                console.error('Помилка при читанні Binance WebSocket повідомлення:', error);
            }
        });

        socket.addEventListener('error', () => {
            if (isDisposed) return;

            console.error('Помилка Binance WebSocket. Очікуємо close та перепідключення.');

            if (!hasConnected) {
                handlers.onStatusChange?.('connecting');
            }
        });

        socket.addEventListener('close', () => {
            if (isDisposed) return;

            handlers.onStatusChange?.('reconnecting');
            reconnectTimeoutId = window.setTimeout(connect, 3000);
        });
    };

    connect();

    return () => {
        isDisposed = true;

        if (reconnectTimeoutId) {
            window.clearTimeout(reconnectTimeoutId);
        }

        if (socket && socket.readyState < WebSocket.CLOSING) {
            socket.close();
        }
    };
};

// Пошук монет за текстовим запитом
const searchCoins = async (query) => {
    if (!query?.trim()) return [];

    try {
        const localCoins = await findCoinsLocally(query, { silent: true });

        let serverCoins = [];
        let searchWasRateLimited = false;

        // 1. Спершу пробуємо легший CoinGecko search.
        try {
            const data = await requestJson(`${API_BASE}/search?query=${encodeURIComponent(query)}`);
            serverCoins = data?.coins ?? [];
            mergeCoinsIntoDirectoryCache(serverCoins);
        } catch (error) {
            if (isRateLimitedError(error)) {
                searchWasRateLimited = true;
            } else {
                console.error('Помилка при серверному пошуку CoinGecko:', error);
            }
        }

        const coins = rankCoinsByQuery(
            query,
            filterRelevantCoins(query, dedupeCoinsById([...serverCoins, ...localCoins]))
        ).slice(0, SEARCH_CANDIDATE_POOL_SIZE);

        if (!coins.length) {
            if (searchWasRateLimited) {
                const error = new Error('CoinGecko search is rate limited');
                error.code = 'COINGECKO_RATE_LIMIT';
                throw error;
            }

            return [];
        }

        return await fetchSearchCoinResults(query, coins);

    } catch (error) {
        console.error('Помилка при пошуку монет:', error);
        return [];
    }
};

const fetchSearchCoinResults = async (query, coins) => {
    const rankedCoins = rankCoinsByQuery(
        query,
        filterRelevantCoins(query, dedupeCoinsById(coins))
    ).slice(0, SEARCH_CANDIDATE_POOL_SIZE);

    const metadataById = Object.fromEntries(
        rankedCoins.map((coin) => [coin.id, {
            name: coin.name,
            symbol: coin.symbol,
            image: coin.large || coin.thumb || '',
            marketCapRank: coin.market_cap_rank ?? null,
        }])
    );

    const coinIds = rankedCoins.map((coin) => coin.id);
    const snapshotsById = new Map();
    let pricingWasRateLimited = false;

    // Крок 1: Binance batch (швидкий, без rate-limit) для монет з унікальним символом
    const uniqueSymbolCoins = getCoinsWithUniqueSymbols(rankedCoins);
    const binanceSnapshots = await fetchBinanceCoinsSnapshot(uniqueSymbolCoins, metadataById);
    binanceSnapshots.forEach((coin) => snapshotsById.set(coin.id, coin));

    // Крок 2: CoinGecko /coins/markets для монет без ціни
    const missingAfterBinance = coinIds.filter((id) => !snapshotsById.has(id));
    if (missingAfterBinance.length) {
        try {
            const marketSnapshots = await fetchCoinsMarketSnapshot(missingAfterBinance, metadataById, {
                silent: true,
                throwOnRateLimit: true,
                includeDetails: false,
            });
            marketSnapshots.forEach((coin) => snapshotsById.set(coin.id, coin));
        } catch (error) {
            if (isRateLimitedError(error)) {
                pricingWasRateLimited = true;
            } else {
                throw error;
            }
        }
    }

    // Крок 3: CoinGecko /simple/price для тих що залишились
    const stillMissingCoinIds = coinIds.filter((coinId) => !snapshotsById.has(coinId));
    if (stillMissingCoinIds.length) {
        try {
            const priceSnapshots = await fetchCoinsSnapshot(stillMissingCoinIds, metadataById, {
                silent: true,
                throwOnRateLimit: true,
            });
            priceSnapshots.forEach((coin) => snapshotsById.set(coin.id, coin));
        } catch (error) {
            if (isRateLimitedError(error)) {
                pricingWasRateLimited = true;
            } else {
                throw error;
            }
        }
    }

    // Крок 4: Детальний endpoint для монет що ще не отримали ціну
    const unresolvedCoinIds = coinIds.filter((coinId) => !snapshotsById.has(coinId));
    if (unresolvedCoinIds.length) {
        const detailedSnapshots = await Promise.all(
            unresolvedCoinIds.map((coinId) => fetchCoinMarketDetails(coinId, metadataById[coinId], { silent: true }))
        );
        detailedSnapshots.filter(Boolean).forEach((coin) => snapshotsById.set(coin.id, coin));
    }

    if (!snapshotsById.size && pricingWasRateLimited) {
        return rankedCoins.map((coin) => mapSearchCandidateCoin(coin, metadataById[coin.id])).slice(0, MAX_SEARCH_CANDIDATES);
    }

    // Завжди повертаємо топ-N за релевантністю: прайс коли є, N/A якщо немає.
    // Це гарантує, що релевантні монети (наприклад ADA/Cardano) не витісняються
    // нерелевантними токенами лише тому що ті отримали ціну від Binance.
    return rankedCoins
        .slice(0, MAX_SEARCH_CANDIDATES)
        .map((coin) => snapshotsById.get(coin.id) || mapSearchCandidateCoin(coin, metadataById[coin.id]));
};

// Топ монет за 24h обсягом
const getTop10ByVolume = async () => {
    try {
        const data = await requestJson(
            `${API_BASE}/coins/markets?vs_currency=usd&order=volume_desc&per_page=10&sparkline=false`
        );
        return data.map(mapMarketCoin);
    } catch (error) {
        console.error('Помилка при отриманні топ монет:', error);
        return [];
    }
};

// Пошук id монети за її символом
const getCoinId = async (symbol) => {
    if (!symbol?.trim()) return null;

    try {
        const data = await requestJson(`${API_BASE}/search?query=${encodeURIComponent(symbol)}`);
        const exactBySymbol = data?.coins?.find(
            (coin) => coin.symbol?.toUpperCase() === symbol.trim().toUpperCase()
        );
        return (exactBySymbol || data?.coins?.[0])?.id ?? null;
    } catch (error) {
        console.error('Помилка при пошуку ID монети:', error);
        return null;
    }
};

// Підбір кандидатів лише з локального кешу (без мережевих запитів, для миттєвого відображення)
const searchCoinCandidatesLocally = async (query) => {
    if (!query?.trim()) return [];
    const localCoins = await findCoinsLocally(query, { silent: true });
    return localCoins.slice(0, MAX_SEARCH_CANDIDATES).map((coin) => mapSearchCandidateCoin(coin));
};

// Утиліти (для UI і тестів)
const calculatePriceChange = (oldPrice, newPrice) => {
    if (!oldPrice || oldPrice === 0) return 0;
    return Number((((newPrice - oldPrice) / oldPrice) * 100).toFixed(2));
};

const validateTicker = (ticker) => {
    const clean = ticker?.trim();
    return Boolean(clean && clean.length >= 2 && clean.length <= 5);
};

const getStatusColor = (change) => {
    if (change > 0) return 'green';
    if (change < 0) return 'red';
    return 'gray';
};

export {
    calculatePriceChange,
    fetchBinanceOrderBook,
    fetchBinanceKlines,
    fetchCoinMarketChart,
    fetchCoinMarketChartRange,
    fetchCoinPrice,
    fetchCoinsSnapshot,
    getBinanceTickerSymbol,
    getStatusColor,
    getTop10ByVolume,
    prefetchCoinsDirectory,
    resetApiCaches,
    searchCoins,
    searchCoinCandidatesLocally,
    subscribeToBinanceTickers,
    validateTicker,
};