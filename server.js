import http from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = join(process.cwd(), "public");
const MAX_QUOTE_SYMBOLS = 120;
const QUOTE_CACHE_TTL_MS = 20_000;
const QUOTE_STALE_TTL_MS = 10 * 60_000;
const quoteCache = new Map();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const STOCK_NAMES = {
  AAPL: "Apple Inc.",
  MSFT: "Microsoft Corp.",
  NVDA: "NVIDIA Corp.",
  TSLA: "Tesla Inc.",
  AMZN: "Amazon.com Inc.",
  GOOGL: "Alphabet Inc.",
  META: "Meta Platforms Inc.",
  AMD: "Advanced Micro Devices",
  NFLX: "Netflix Inc.",
  JPM: "JPMorgan Chase & Co."
};

const FOREX_NAMES = {
  "EUR/USD": "Euro / US Dollar",
  "GBP/USD": "British Pound / US Dollar",
  "USD/JPY": "US Dollar / Japanese Yen",
  "USD/CAD": "US Dollar / Canadian Dollar",
  "AUD/USD": "Australian Dollar / US Dollar",
  "NZD/USD": "New Zealand Dollar / US Dollar",
  "USD/CHF": "US Dollar / Swiss Franc",
  "EUR/GBP": "Euro / British Pound",
  "EUR/JPY": "Euro / Japanese Yen",
  "GBP/JPY": "British Pound / Japanese Yen"
};

const HISTORY_PERIODS = {
  "1h": { label: "1H", range: "1d", interval: "1m", points: 60 },
  "4h": { label: "4H", range: "1d", interval: "5m", points: 48 },
  "1d": { label: "1D", range: "1d", interval: "5m" },
  "5d": { label: "5D", range: "5d", interval: "15m" },
  "1mo": { label: "1M", range: "1mo", interval: "1d" },
  "6mo": { label: "6M", range: "6mo", interval: "1d" },
  "1y": { label: "1Y", range: "1y", interval: "1wk" }
};

const CUSTOM_UNITS = new Set(["hours", "days", "months"]);

const json = (res, status, payload) => {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(payload));
};

const cleanSymbol = (value) =>
  String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9.^/-]/g, "")
    .slice(0, 16);

function normalizeForexSymbol(value) {
  const clean = cleanSymbol(value);
  if (clean.includes("/")) return clean;
  const letters = clean.replace(/[^A-Z]/g, "");
  return letters.length === 6 ? `${letters.slice(0, 3)}/${letters.slice(3)}` : clean;
}

function assetTypeFromQuery(query) {
  return query.get("type") === "forex" || query.get("assetType") === "forex" ? "forex" : "us_stock";
}

const getQuery = (req) => new URL(req.url, `http://${req.headers.host}`).searchParams;

async function readJsonBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) {
      throw new Error("Request body is too large");
    }
  }
  return body ? JSON.parse(body) : {};
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 StockDashboard/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Upstream returned ${response.status}`);
  }

  return response.json();
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase is not configured on the server");
  }
  return { url, anonKey };
}

function supabaseServiceConfig() {
  const { url } = supabaseConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for paper API keys");
  }
  return { url, serviceRoleKey };
}

function bearerToken(req) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new Error("Missing user session");
  }
  return match[1];
}

async function supabaseRequest(path, token, options = {}) {
  const { url, anonKey } = supabaseConfig();
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || data?.error_description || `Supabase returned ${response.status}`);
  }
  return data;
}

async function supabaseAdminRequest(path, options = {}) {
  const { url, serviceRoleKey } = supabaseServiceConfig();
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || data?.error_description || `Supabase returned ${response.status}`);
  }
  return data;
}

async function currentUser(token) {
  const user = await supabaseRequest("/auth/v1/user", token, { method: "GET" });
  if (!user?.id) {
    throw new Error("Could not verify user session");
  }
  return user;
}

function hashSecret(secret) {
  return createHash("sha256").update(secret).digest("hex");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "utf8");
  const rightBuffer = Buffer.from(String(right || ""), "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function generatePaperCredentials() {
  return {
    key: `pk_paper_${randomBytes(12).toString("hex")}`,
    secret: `sk_paper_${randomBytes(24).toString("hex")}`
  };
}

function actorRequest(actor, path, options = {}) {
  return actor.admin ? supabaseAdminRequest(path, options) : supabaseRequest(path, actor.token, options);
}

async function sessionActor(req) {
  const token = bearerToken(req);
  return { token, user: await currentUser(token), admin: false };
}

async function apiKeyActor(req) {
  const keyPrefix = String(req.headers["x-poshkan-key"] || "");
  const secret = String(req.headers["x-poshkan-secret"] || "");
  if (!keyPrefix || !secret) return null;

  const rows = await supabaseAdminRequest(
    `/rest/v1/api_keys?select=id,user_id,key_prefix,secret_hash,permissions,status&key_prefix=eq.${encodeURIComponent(
      keyPrefix
    )}&status=eq.active&limit=1`,
    { method: "GET" }
  );
  const record = rows?.[0];
  if (!record || !safeEqual(hashSecret(secret), record.secret_hash)) {
    throw new Error("Invalid Poshkan API key or secret");
  }

  const permissions = Array.isArray(record.permissions) ? record.permissions : [];
  if (!permissions.includes("paper:trade") && !permissions.includes("paper:read")) {
    throw new Error("Paper API key does not have paper permissions");
  }

  await supabaseAdminRequest(`/rest/v1/api_keys?id=eq.${encodeURIComponent(record.id)}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({ last_used_at: new Date().toISOString() })
  });

  return {
    admin: true,
    apiKeyId: record.id,
    user: { id: record.user_id, user_metadata: {} },
    permissions
  };
}

async function paperActor(req, requiredPermission) {
  const apiActor = await apiKeyActor(req);
  if (apiActor) {
    if (!apiActor.permissions.includes(requiredPermission)) {
      throw new Error(`Paper API key is missing ${requiredPermission}`);
    }
    return apiActor;
  }
  return sessionActor(req);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 StockDashboard/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Upstream returned ${response.status}`);
  }

  return response.text();
}

function demoQuote(symbol, index = 0, requestedSymbol = symbol) {
  const base = 95 + [...symbol].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 220;
  const wave = Math.sin(Date.now() / 900000 + index) * 2.8;
  const change = Number((wave + (index % 2 ? -0.45 : 0.38)).toFixed(2));
  const price = Number((base + wave).toFixed(2));

  return {
    symbol,
    requestedSymbol,
    shortName: STOCK_NAMES[symbol] || `${symbol} Holdings`,
    regularMarketPrice: price,
    regularMarketChange: change,
    regularMarketChangePercent: Number(((change / price) * 100).toFixed(2)),
    regularMarketTime: Math.floor(Date.now() / 1000),
    regularMarketVolume: Math.round(1_000_000 + base * 6231),
    regularMarketDayHigh: Number((price + 1.8).toFixed(2)),
    regularMarketDayLow: Number((price - 2.1).toFixed(2)),
    marketState: "DEMO",
    source: "Demo fallback",
    cacheStatus: "demo",
    fetchedAt: Date.now(),
    dataAgeSeconds: 0
  };
}

function demoForexQuote(symbol, index = 0) {
  const pair = normalizeForexSymbol(symbol);
  const seed = [...pair].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const base = pair.endsWith("/JPY") ? 100 + (seed % 60) : 0.7 + (seed % 80) / 100;
  const wave = Math.sin(Date.now() / 900000 + index) * (pair.endsWith("/JPY") ? 0.32 : 0.0042);
  const price = Number((base + wave).toFixed(pair.endsWith("/JPY") ? 3 : 5));
  const change = Number((wave / 2).toFixed(pair.endsWith("/JPY") ? 3 : 5));
  const previous = price - change;
  return {
    symbol: pair,
    requestedSymbol: symbol,
    shortName: FOREX_NAMES[pair] || `${pair} Forex Pair`,
    regularMarketPrice: price,
    regularMarketChange: change,
    regularMarketChangePercent: previous ? Number(((change / previous) * 100).toFixed(2)) : 0,
    regularMarketTime: Math.floor(Date.now() / 1000),
    regularMarketVolume: null,
    regularMarketDayHigh: Number((price + Math.abs(change) * 1.8).toFixed(pair.endsWith("/JPY") ? 3 : 5)),
    regularMarketDayLow: Number((price - Math.abs(change) * 1.8).toFixed(pair.endsWith("/JPY") ? 3 : 5)),
    marketState: "FOREX",
    source: "Demo forex fallback",
    cacheStatus: "demo",
    fetchedAt: Date.now(),
    dataAgeSeconds: 0
  };
}

function stampQuote(quote, cacheStatus, fetchedAt = Date.now()) {
  return {
    ...quote,
    cacheStatus,
    fetchedAt,
    dataAgeSeconds: Math.max(0, Math.round((Date.now() - fetchedAt) / 1000))
  };
}

function twelveDataKey() {
  return process.env.TWELVE_DATA_API_KEY || "";
}

async function fetchTwelveData(path, params) {
  const apiKey = twelveDataKey();
  if (!apiKey) throw new Error("TWELVE_DATA_API_KEY is not configured");
  const query = new URLSearchParams({ ...params, apikey: apiKey });
  const data = await fetchJson(`https://api.twelvedata.com/${path}?${query}`);
  if (data?.status === "error" || data?.code >= 400) {
    throw new Error(data.message || "Twelve Data returned an error");
  }
  return data;
}

async function forexQuoteForSymbol(symbol) {
  const pair = normalizeForexSymbol(symbol);
  const cached = quoteCache.get(`forex:${pair}`);
  const now = Date.now();
  if (cached && now - cached.fetchedAt <= QUOTE_CACHE_TTL_MS) {
    return stampQuote(cached.quote, "cached", cached.fetchedAt);
  }

  try {
    const data = await fetchTwelveData("quote", { symbol: pair });
    const price = Number(data.close || data.price || data.previous_close);
    if (!Number.isFinite(price)) throw new Error(`No usable forex quote for ${pair}`);
    const change = Number(data.change);
    const percent = Number(data.percent_change);
    const quote = {
      symbol: pair,
      requestedSymbol: symbol,
      shortName: data.name || FOREX_NAMES[pair] || `${pair} Forex Pair`,
      regularMarketPrice: price,
      regularMarketChange: Number.isFinite(change) ? change : null,
      regularMarketChangePercent: Number.isFinite(percent) ? percent : null,
      regularMarketTime: data.timestamp || Math.floor(Date.now() / 1000),
      regularMarketVolume: null,
      regularMarketDayHigh: Number(data.high) || null,
      regularMarketDayLow: Number(data.low) || null,
      marketState: "FOREX",
      source: "Twelve Data",
      cacheStatus: "fresh",
      fetchedAt: Date.now(),
      dataAgeSeconds: 0
    };
    const fetchedAt = Date.now();
    quoteCache.set(`forex:${pair}`, { quote: stampQuote(quote, "fresh", fetchedAt), fetchedAt });
    return stampQuote(quote, "fresh", fetchedAt);
  } catch (error) {
    if (cached && now - cached.fetchedAt <= QUOTE_STALE_TTL_MS) {
      return stampQuote(cached.quote, "stale", cached.fetchedAt);
    }
    throw error;
  }
}

function quoteFromChart(symbol, data, requestedSymbol = symbol) {
  const result = data?.chart?.result?.[0];
  const meta = result?.meta || {};
  const timestamps = result?.timestamp || [];
  const close = result?.indicators?.quote?.[0]?.close || [];
  const lastCloseIndex = close.findLastIndex((price) => Number.isFinite(price));
  const latestPrice = Number.isFinite(meta.regularMarketPrice)
    ? meta.regularMarketPrice
    : close[lastCloseIndex];
  const previousClose = meta.chartPreviousClose || meta.previousClose;
  const change =
    Number.isFinite(latestPrice) && Number.isFinite(previousClose) ? latestPrice - previousClose : null;
  const changePercent =
    Number.isFinite(change) && Number.isFinite(previousClose) && previousClose !== 0
      ? (change / previousClose) * 100
      : null;

  if (!Number.isFinite(latestPrice)) {
    throw new Error(`No usable price returned for ${symbol}`);
  }

  const now = Math.floor(Date.now() / 1000);
  const regularPeriod = meta.currentTradingPeriod?.regular;
  const marketState =
    regularPeriod && now >= regularPeriod.start && now <= regularPeriod.end ? "REGULAR" : "CLOSED";

  return {
    symbol: cleanSymbol(meta.symbol || symbol),
    requestedSymbol,
    shortName: meta.shortName || meta.longName || STOCK_NAMES[symbol] || symbol,
    regularMarketPrice: Number(latestPrice.toFixed(2)),
    regularMarketChange: Number.isFinite(change) ? Number(change.toFixed(2)) : null,
    regularMarketChangePercent: Number.isFinite(changePercent) ? Number(changePercent.toFixed(2)) : null,
    regularMarketTime: meta.regularMarketTime || timestamps[lastCloseIndex] || now,
    regularMarketVolume: meta.regularMarketVolume || null,
    regularMarketDayHigh: meta.regularMarketDayHigh || null,
    regularMarketDayLow: meta.regularMarketDayLow || null,
    marketState,
    source: "Yahoo chart",
    cacheStatus: "fresh",
    fetchedAt: Date.now(),
    dataAgeSeconds: 0
  };
}

async function resolveYahooSymbol(symbol) {
  const endpoint = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
    symbol
  )}&quotesCount=8&newsCount=0`;
  const data = await fetchJson(endpoint);
  const quotes = Array.isArray(data?.quotes) ? data.quotes : [];
  const suggestions = quotes
    .filter((quote) => ["EQUITY", "ETF"].includes(quote.quoteType))
    .slice(0, 5)
    .map((quote) => ({
      symbol: cleanSymbol(quote.symbol),
      name: quote.shortname || quote.longname || quote.name || quote.symbol,
      exchange: quote.exchDisp || quote.exchange || "",
      quoteType: quote.quoteType || ""
    }))
    .filter((quote) => quote.symbol);
  return { suggestions };
}

async function searchHandler(req, res) {
  const params = getQuery(req);
  const query = String(params.get("q") || "").trim();
  const assetType = assetTypeFromQuery(params);
  if (!query) {
    return json(res, 200, { suggestions: [] });
  }

  if (assetType === "forex") {
    const pair = normalizeForexSymbol(query);
    const localSuggestions = Object.entries(FOREX_NAMES)
      .filter(([symbol, name]) => symbol.includes(pair) || symbol.replace("/", "").includes(pair.replace("/", "")) || name.toUpperCase().includes(query.toUpperCase()))
      .slice(0, 8)
      .map(([symbol, name]) => ({ symbol, name, exchange: "Forex", quoteType: "FOREX" }));
    try {
      const data = await fetchTwelveData("symbol_search", { symbol: pair, outputsize: 8 });
      const suggestions = (Array.isArray(data.data) ? data.data : [])
        .filter((item) => item.instrument_type === "Forex Pair" || item.type === "Physical Currency")
        .map((item) => ({
          symbol: normalizeForexSymbol(item.symbol),
          name: item.instrument_name || FOREX_NAMES[normalizeForexSymbol(item.symbol)] || item.symbol,
          exchange: item.exchange || "Forex",
          quoteType: "FOREX"
        }))
        .filter((item) => item.symbol);
      return json(res, 200, { suggestions: suggestions.length ? suggestions : localSuggestions });
    } catch (error) {
      return json(res, 200, {
        warning: error.message,
        suggestions: localSuggestions.length ? localSuggestions : [{ symbol: pair, name: FOREX_NAMES[pair] || `${pair} Forex Pair`, exchange: "Forex", quoteType: "FOREX" }]
      });
    }
  }

  try {
    const { suggestions } = await resolveYahooSymbol(query);
    return json(res, 200, { suggestions });
  } catch (error) {
    const symbol = cleanSymbol(query);
    return json(res, 200, {
      warning: error.message,
      suggestions: symbol
        ? [{ symbol, name: STOCK_NAMES[symbol] || symbol, exchange: "", quoteType: "EQUITY" }]
        : []
    });
  }
}

function invalidSymbolError(symbol, cause, suggestions = []) {
  const error = new Error(`No stock symbol found for ${symbol}`);
  error.invalidSymbol = symbol;
  error.suggestions = suggestions;
  error.cause = cause;
  return error;
}

async function fetchFreshQuoteForSymbol(symbol) {
  const chartEndpoint = (nextSymbol) =>
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      nextSymbol
    )}?range=1d&interval=1m&includePrePost=true`;

  try {
    const data = await fetchJson(chartEndpoint(symbol));
    return quoteFromChart(symbol, data);
  } catch (error) {
    const { suggestions } = await resolveYahooSymbol(symbol);
    const exactMatch = suggestions.some((quote) => quote.symbol === symbol);
    if (exactMatch) {
      const fallbackError = new Error(`Live quote unavailable for ${symbol}`);
      fallbackError.cause = error;
      throw fallbackError;
    }
    throw invalidSymbolError(symbol, error, suggestions);
  }
}

async function quoteForSymbol(symbol) {
  const cached = quoteCache.get(symbol);
  const now = Date.now();
  if (cached && now - cached.fetchedAt <= QUOTE_CACHE_TTL_MS) {
    return stampQuote(cached.quote, "cached", cached.fetchedAt);
  }

  try {
    const quote = await fetchFreshQuoteForSymbol(symbol);
    const fetchedAt = Date.now();
    quoteCache.set(symbol, { quote: stampQuote(quote, "fresh", fetchedAt), fetchedAt });
    return stampQuote(quote, "fresh", fetchedAt);
  } catch (error) {
    if (cached && now - cached.fetchedAt <= QUOTE_STALE_TTL_MS) {
      return stampQuote(cached.quote, "stale", cached.fetchedAt);
    }
    throw error;
  }
}

function getCustomHistoryConfig(amountValue, unitValue) {
  const unit = CUSTOM_UNITS.has(unitValue) ? unitValue : "days";
  const maxByUnit = { hours: 168, days: 365, months: 60 };
  const amount = Math.min(Math.max(Number.parseInt(amountValue, 10) || 1, 1), maxByUnit[unit]);
  const now = Math.floor(Date.now() / 1000);
  const secondsByUnit = { hours: 3600, days: 86400, months: 30 * 86400 };
  const totalSeconds = amount * secondsByUnit[unit];
  const interval =
    unit === "hours"
      ? "1m"
      : unit === "days" && amount <= 5
        ? "5m"
        : unit === "days" && amount <= 30
          ? "1h"
          : unit === "months" && amount <= 12
            ? "1d"
            : "1wk";

  return {
    custom: true,
    label: `${amount} ${unit}`,
    period: "custom",
    unit,
    amount,
    interval,
    period1: now - totalSeconds,
    period2: now,
    points: unit === "hours" ? Math.min(amount * 60, 720) : undefined
  };
}

function getHistoryConfig(query) {
  const period = query.get("period");

  if (period === "custom" || query.has("amount") || query.has("unit")) {
    return getCustomHistoryConfig(query.get("amount"), query.get("unit"));
  }

  return {
    period: HISTORY_PERIODS[period] ? period : "1d",
    ...(HISTORY_PERIODS[period] || HISTORY_PERIODS["1d"])
  };
}

function twelveInterval(interval) {
  return (
    {
      "1m": "1min",
      "5m": "5min",
      "15m": "15min",
      "30m": "30min",
      "1h": "1h",
      "1d": "1day",
      "1wk": "1week"
    }[interval] || "1day"
  );
}

function demoHistory(symbol, config = HISTORY_PERIODS["1d"]) {
  const seed = [...symbol].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const start = 80 + (seed % 170);
  const now = Math.floor(Date.now() / 1000);
  const count = config.points || 64;
  const stepSeconds =
    {
      "1m": 60,
      "5m": 300,
      "15m": 900,
      "1d": 86400,
      "1wk": 604800
    }[config.interval] || 300;

  return Array.from({ length: count }, (_, index) => {
    const drift = Math.sin(index / 6 + seed) * 2.4 + Math.cos(index / 11) * 1.7;
    const close = start + drift + index * 0.035;
    const open = close - Math.sin(index / 4 + seed) * 0.8;
    const high = Math.max(open, close) + 0.35 + Math.abs(Math.cos(index / 5)) * 0.9;
    const low = Math.min(open, close) - 0.35 - Math.abs(Math.sin(index / 5)) * 0.9;
    return {
      time: now - (count - 1 - index) * stepSeconds,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      price: Number(close.toFixed(2)),
      volume: Math.round(400000 + (seed % 700) * 900 + Math.abs(Math.sin(index / 3 + seed)) * 1200000)
    };
  });
}

function demoForexHistory(symbol, config = HISTORY_PERIODS["1d"]) {
  const pair = normalizeForexSymbol(symbol);
  const seed = [...pair].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const start = pair.endsWith("/JPY") ? 110 + (seed % 40) : 0.8 + (seed % 90) / 100;
  const now = Math.floor(Date.now() / 1000);
  const count = config.points || 64;
  const stepSeconds =
    {
      "1m": 60,
      "5m": 300,
      "15m": 900,
      "30m": 1800,
      "1h": 3600,
      "1day": 86400,
      "1week": 604800
    }[config.interval] || 300;
  const decimals = pair.endsWith("/JPY") ? 3 : 5;

  return Array.from({ length: count }, (_, index) => {
    const drift = Math.sin(index / 5 + seed) * (pair.endsWith("/JPY") ? 0.22 : 0.0032);
    const close = start + drift + index * (pair.endsWith("/JPY") ? 0.004 : 0.00004);
    const open = close - Math.sin(index / 4 + seed) * (pair.endsWith("/JPY") ? 0.06 : 0.0008);
    const high = Math.max(open, close) + (pair.endsWith("/JPY") ? 0.04 : 0.0005);
    const low = Math.min(open, close) - (pair.endsWith("/JPY") ? 0.04 : 0.0005);
    return {
      time: now - (count - 1 - index) * stepSeconds,
      open: Number(open.toFixed(decimals)),
      high: Number(high.toFixed(decimals)),
      low: Number(low.toFixed(decimals)),
      close: Number(close.toFixed(decimals)),
      price: Number(close.toFixed(decimals)),
      volume: null
    };
  });
}

function demoNews(symbol) {
  return [
    {
      title: `${symbol} market snapshot: price action, volume, and investor attention`,
      link: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`,
      publisher: "Yahoo Finance",
      publishedAt: new Date().toISOString(),
      summary: "Live news could not be reached from this environment, so this item links to the quote page."
    },
    {
      title: `Analysts watch ${symbol} as broader market conditions shift`,
      link: `https://www.google.com/search?q=${encodeURIComponent(symbol + " stock news")}`,
      publisher: "Search",
      publishedAt: new Date(Date.now() - 3600000).toISOString(),
      summary: "Use this search link for the latest related coverage when the RSS feed is unavailable."
    }
  ];
}

async function performanceForSymbol(symbol, config) {
  const chartParams = config.custom
    ? `period1=${config.period1}&period2=${config.period2}&interval=${config.interval}`
    : `range=${config.range}&interval=${config.interval}`;
  const endpoint = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?${chartParams}&includePrePost=false`;
  const data = await fetchJson(endpoint);
  const result = data?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0] || {};
  const points = timestamps
    .map((time, index) => ({ time, price: quote.close?.[index] }))
    .filter((point) => Number.isFinite(point.price));

  if (points.length < 2) {
    throw new Error(`Not enough performance data for ${symbol}`);
  }

  const first = points[0];
  const last = points[points.length - 1];
  const change = last.price - first.price;
  const changePercent = first.price ? (change / first.price) * 100 : 0;

  return {
    symbol,
    startPrice: Number(first.price.toFixed(4)),
    endPrice: Number(last.price.toFixed(4)),
    change: Number(change.toFixed(4)),
    changePercent: Number(changePercent.toFixed(4)),
    startTime: first.time,
    endTime: last.time,
    effectiveLabel: config.effectiveLabel || ""
  };
}

async function forexPerformanceForSymbol(symbol, config) {
  const pair = normalizeForexSymbol(symbol);
  const data = await fetchTwelveData("time_series", {
    symbol: pair,
    interval: twelveInterval(config.interval),
    outputsize: String(config.points || 120),
    order: "ASC"
  });
  const points = (Array.isArray(data.values) ? data.values : [])
    .map((item) => ({ time: Math.floor(new Date(item.datetime).getTime() / 1000), price: Number(item.close) }))
    .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.price));
  if (points.length < 2) throw new Error(`Not enough performance data for ${pair}`);
  const first = points[0];
  const last = points[points.length - 1];
  const change = last.price - first.price;
  const changePercent = first.price ? (change / first.price) * 100 : 0;
  return {
    symbol: pair,
    startPrice: Number(first.price.toFixed(6)),
    endPrice: Number(last.price.toFixed(6)),
    change: Number(change.toFixed(6)),
    changePercent: Number(changePercent.toFixed(4)),
    startTime: first.time,
    endTime: last.time,
    effectiveLabel: config.effectiveLabel || ""
  };
}

function demoForexPerformance(symbol, config) {
  const history = demoForexHistory(symbol, config);
  const first = history[0];
  const last = history[history.length - 1];
  const change = last.price - first.price;
  const changePercent = first.price ? (change / first.price) * 100 : 0;
  return {
    symbol: normalizeForexSymbol(symbol),
    startPrice: first.price,
    endPrice: last.price,
    change: Number(change.toFixed(6)),
    changePercent: Number(changePercent.toFixed(4)),
    startTime: first.time,
    endTime: last.time,
    effectiveLabel: config.effectiveLabel || ""
  };
}

function holdingPeriodLabel(seconds) {
  const days = Math.max(1, Math.ceil(seconds / 86400));
  if (days < 31) return `${days} day${days === 1 ? "" : "s"}`;
  const months = Math.max(1, Math.ceil(days / 30));
  return `${months} month${months === 1 ? "" : "s"}`;
}

async function quotesHandler(req, res) {
  const query = getQuery(req);
  const assetType = assetTypeFromQuery(query);
  const symbols = (query.get("symbols") || (assetType === "forex" ? "EUR/USD,GBP/USD,USD/JPY" : "AAPL,MSFT,NVDA"))
    .split(",")
    .map((symbol) => (assetType === "forex" ? normalizeForexSymbol(symbol) : cleanSymbol(symbol)))
    .filter(Boolean)
    .slice(0, MAX_QUOTE_SYMBOLS);

  if (!symbols.length) {
    return json(res, 400, { error: `Add at least one ${assetType === "forex" ? "forex pair" : "stock symbol"}.` });
  }

  try {
    const quoteResults = await Promise.allSettled(
      symbols.map((symbol) => (assetType === "forex" ? forexQuoteForSymbol(symbol) : quoteForSymbol(symbol)))
    );

    const invalids = [];
    const quotes = quoteResults.flatMap((result, index) => {
      if (result.status === "fulfilled") return [result.value];
      const error = result.reason;
      if (error?.invalidSymbol) {
        invalids.push({
          symbol: symbols[index],
          message: error.message,
          suggestions: error.suggestions || []
        });
        return [];
      }
      return [assetType === "forex" ? demoForexQuote(symbols[index], index) : demoQuote(symbols[index], index)];
    });
    const failed = quoteResults.filter((result) => result.status === "rejected" && !result.reason?.invalidSymbol).length;
    const cached = quotes.filter((quote) => quote.cacheStatus === "cached").length;
    const stale = quotes.filter((quote) => quote.cacheStatus === "stale").length;
    const demo = quotes.filter((quote) => quote.cacheStatus === "demo").length;
    const live = quotes.length - cached - stale - demo;

    return json(res, 200, {
      source: failed || stale || demo ? "mixed" : cached ? "cached" : "yahoo-chart",
      warning: failed
        ? `${failed} symbol(s) could not be refreshed and are showing demo fallback.`
        : stale
          ? `${stale} symbol(s) are showing recently cached prices while live refresh recovers.`
          : null,
      reliability: { live, cached, stale, demo },
      quotes,
      invalids
    });
  } catch (error) {
    return json(res, 200, {
      source: "demo",
      warning: error.message,
      reliability: { live: 0, cached: 0, stale: 0, demo: symbols.length },
      quotes: symbols.map((symbol, index) => (assetType === "forex" ? demoForexQuote(symbol, index) : demoQuote(symbol, index)))
    });
  }
}

async function performanceHandler(req, res) {
  const query = getQuery(req);
  const assetType = assetTypeFromQuery(query);
  const symbols = (query.get("symbols") || "")
    .split(",")
    .map((symbol) => (assetType === "forex" ? normalizeForexSymbol(symbol) : cleanSymbol(symbol)))
    .filter(Boolean)
    .slice(0, MAX_QUOTE_SYMBOLS);
  const config = getCustomHistoryConfig(query.get("amount") || 4, query.get("unit") || "days");
  const heldSince = new Map(
    (query.get("heldSince") || "")
      .split(",")
      .map((item) => {
        const [rawSymbol, rawTime] = item.split(":");
        const symbol = cleanSymbol(rawSymbol);
        const time = Math.max(0, Number.parseInt(rawTime, 10) || 0);
        return symbol && time ? [symbol, time] : null;
      })
      .filter(Boolean)
  );

  if (!symbols.length) {
    return json(res, 400, { error: "Add at least one stock symbol." });
  }

  const results = await Promise.allSettled(
    symbols.map((symbol) => {
      const heldTime = heldSince.get(symbol);
      const effectiveConfig = { ...config };
      if (heldTime && config.period1 && heldTime > config.period1) {
        const heldSeconds = Math.floor(Date.now() / 1000) - heldTime;
        effectiveConfig.period1 = heldTime;
        effectiveConfig.custom = true;
        effectiveConfig.interval = heldSeconds <= 5 * 86400 ? "5m" : heldSeconds <= 30 * 86400 ? "1h" : config.interval;
        effectiveConfig.effectiveLabel = holdingPeriodLabel(heldSeconds);
      }
      return assetType === "forex" ? forexPerformanceForSymbol(symbol, effectiveConfig) : performanceForSymbol(symbol, effectiveConfig);
    })
  );
  const performance = [];
  const failed = [];

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      performance.push(result.value);
    } else {
      if (assetType === "forex") {
        performance.push(demoForexPerformance(symbols[index], config));
      }
      failed.push({ symbol: symbols[index], error: result.reason?.message || "Performance unavailable" });
    }
  });

  return json(res, 200, {
    source: failed.length ? "mixed" : "yahoo",
    periodLabel: config.label,
    performance,
    failed
  });
}

async function historyHandler(req, res) {
  const query = getQuery(req);
  const assetType = assetTypeFromQuery(query);
  const symbol = assetType === "forex" ? normalizeForexSymbol(query.get("symbol")) : cleanSymbol(query.get("symbol"));
  const config = getHistoryConfig(query);

  if (!symbol) {
    return json(res, 400, { error: "Missing stock symbol." });
  }

  try {
    if (assetType === "forex") {
      const data = await fetchTwelveData("time_series", {
        symbol,
        interval: twelveInterval(config.interval),
        outputsize: String(config.points || 120),
        order: "ASC"
      });
      const values = Array.isArray(data.values) ? data.values : [];
      const history = values
        .map((item) => ({
          time: Math.floor(new Date(item.datetime).getTime() / 1000),
          open: Number(item.open),
          high: Number(item.high),
          low: Number(item.low),
          close: Number(item.close),
          price: Number(item.close),
          volume: null
        }))
        .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.price));
      return json(res, 200, {
        source: "twelve-data",
        symbol,
        period: config.period,
        periodLabel: config.label,
        history: history.length ? history : demoForexHistory(symbol, config)
      });
    }

    const chartParams = config.custom
      ? `period1=${config.period1}&period2=${config.period2}&interval=${config.interval}`
      : `range=${config.range}&interval=${config.interval}`;
    const endpoint = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      symbol
    )}?${chartParams}&includePrePost=false`;
    const data = await fetchJson(endpoint);
    const result = data?.chart?.result?.[0];
    const timestamps = result?.timestamp || [];
    const quote = result?.indicators?.quote?.[0] || {};
    let history = timestamps
      .map((time, index) => {
        const close = quote.close?.[index];
        return {
          time,
          open: quote.open?.[index],
          high: quote.high?.[index],
          low: quote.low?.[index],
          close,
          price: close,
          volume: quote.volume?.[index]
        };
      })
      .filter((point) => Number.isFinite(point.price));

    if (config.points) {
      history = history.slice(-config.points);
    }

    return json(res, 200, {
      source: "yahoo",
      symbol,
      period: config.period,
      periodLabel: config.label,
      history: history.length ? history : demoHistory(symbol, config)
    });
  } catch (error) {
    return json(res, 200, {
      source: "demo",
      warning: error.message,
      symbol,
      period: config.period,
      periodLabel: config.label,
      history: assetType === "forex" ? demoForexHistory(symbol, config) : demoHistory(symbol, config)
    });
  }
}

function parseRssItems(xml, symbol) {
  const itemBlocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 12);
  const decode = (text = "") =>
    text
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

  return itemBlocks.map(([, block]) => {
    const rawDate = decode(block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]);
    const parsedDate = new Date(rawDate);

    return {
      title: decode(block.match(/<title>([\s\S]*?)<\/title>/)?.[1]).trim(),
      link: decode(block.match(/<link>([\s\S]*?)<\/link>/)?.[1]).trim(),
      publisher: "Yahoo Finance",
      publishedAt: Number.isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString(),
      summary:
        decode(block.match(/<description>([\s\S]*?)<\/description>/)?.[1])
          .replace(/<[^>]+>/g, "")
          .trim() || `Related market news for ${symbol}.`
    };
  });
}

async function newsHandler(req, res) {
  const symbol = cleanSymbol(getQuery(req).get("symbol"));

  if (!symbol) {
    return json(res, 400, { error: "Missing stock symbol." });
  }

  try {
    const endpoint = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(
      symbol
    )}&region=US&lang=en-US`;
    const xml = await fetchText(endpoint);
    const articles = parseRssItems(xml, symbol);
    return json(res, 200, {
      source: "yahoo",
      symbol,
      articles: articles.length ? articles : demoNews(symbol)
    });
  } catch (error) {
    return json(res, 200, {
      source: "demo",
      warning: error.message,
      symbol,
      articles: demoNews(symbol)
    });
  }
}

async function getAccount(actor) {
  const accountRows = await actorRequest(
    actor,
    `/rest/v1/accounts?select=cash,realized_pnl&user_id=eq.${encodeURIComponent(actor.user.id)}&limit=1`,
    { method: "GET" }
  );
  const existing = accountRows?.[0];
  if (existing) {
    return {
      cash: Number(existing.cash) || 0,
      realizedPnl: Number(existing.realized_pnl) || 0
    };
  }

  const startingCash = Math.min(Math.max(Number(actor.user.user_metadata?.starting_cash) || 100000, 1000), 10000000);
  await actorRequest(actor, "/rest/v1/accounts", {
    method: "POST",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({ user_id: actor.user.id, cash: startingCash, realized_pnl: 0 })
  });
  return { cash: startingCash, realizedPnl: 0 };
}

async function getPosition(actor, symbol) {
  const rows = await actorRequest(
    actor,
    `/rest/v1/positions?select=symbol,shares,avg_cost&user_id=eq.${encodeURIComponent(
      actor.user.id
    )}&symbol=eq.${encodeURIComponent(symbol)}&limit=1`,
    { method: "GET" }
  );
  const position = rows?.[0];
  return {
    shares: Number(position?.shares) || 0,
    avgCost: Number(position?.avg_cost) || 0,
    exists: Boolean(position)
  };
}

async function saveAccount(actor, account) {
  await actorRequest(actor, `/rest/v1/accounts?user_id=eq.${encodeURIComponent(actor.user.id)}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({
      cash: account.cash,
      realized_pnl: account.realizedPnl
    })
  });
}

async function savePosition(actor, symbol, position) {
  if (position.shares <= 0) {
    await actorRequest(
      actor,
      `/rest/v1/positions?user_id=eq.${encodeURIComponent(actor.user.id)}&symbol=eq.${encodeURIComponent(symbol)}`,
      { method: "DELETE", headers: { prefer: "return=minimal" } }
    );
    return;
  }

  if (position.exists) {
    await actorRequest(
      actor,
      `/rest/v1/positions?user_id=eq.${encodeURIComponent(actor.user.id)}&symbol=eq.${encodeURIComponent(symbol)}`,
      {
        method: "PATCH",
        headers: { prefer: "return=minimal" },
        body: JSON.stringify({ shares: position.shares, avg_cost: position.avgCost })
      }
    );
    return;
  }

  await actorRequest(actor, "/rest/v1/positions", {
    method: "POST",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({
      user_id: actor.user.id,
      symbol,
      shares: position.shares,
      avg_cost: position.avgCost
    })
  });
}

async function ensureFirstWatchlistSymbol(actor, symbol) {
  const groups = await actorRequest(
    actor,
    `/rest/v1/watchlists?select=id&user_id=eq.${encodeURIComponent(actor.user.id)}&order=sort_order.asc&limit=1`,
    { method: "GET" }
  );
  let watchlistId = groups?.[0]?.id;
  if (!watchlistId) {
    const created = await actorRequest(actor, "/rest/v1/watchlists?select=id", {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({ user_id: actor.user.id, name: "Main", sort_order: 0 })
    });
    watchlistId = created?.[0]?.id;
  }
  if (!watchlistId) return;

  const existing = await actorRequest(
    actor,
    `/rest/v1/watchlist_stocks?select=watchlist_id,symbol&watchlist_id=eq.${encodeURIComponent(
      watchlistId
    )}&symbol=eq.${encodeURIComponent(symbol)}&limit=1`,
    { method: "GET" }
  );
  if (existing?.length) return;

  await actorRequest(actor, "/rest/v1/watchlist_stocks", {
    method: "POST",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({ watchlist_id: watchlistId, symbol })
  });
}

async function paperTradeHandler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Use POST for paper trades." });
  }

  try {
    const actor = await paperActor(req, "paper:trade");
    const body = await readJsonBody(req);
    const portfolioId = String(body.portfolioId || body.portfolio_id || "");
    const symbol = cleanSymbol(body.symbol);
    const side = String(body.side || "").toLowerCase();
    const shares = Math.max(0, Number(body.shares) || 0);

    if (!portfolioId || !symbol || !["buy", "sell"].includes(side) || !shares) {
      return json(res, 400, { error: "Provide portfolioId, symbol, side, and shares." });
    }

    const portfolios = await actorRequest(
      actor,
      `/rest/v1/portfolios?select=id,name,account_type,cash,user_id&user_id=eq.${encodeURIComponent(
        actor.user.id
      )}&id=eq.${encodeURIComponent(portfolioId)}&archived=eq.false&limit=1`,
      { method: "GET" }
    );
    const portfolio = portfolios?.[0];
    if (!portfolio) {
      return json(res, 404, { error: "Portfolio not found." });
    }
    if (portfolio.account_type !== "us_stock") {
      return json(res, 400, { error: "Claude trading currently supports US stock portfolios only." });
    }

    if (actor.admin) {
      const settings = await actorRequest(
        actor,
        `/rest/v1/portfolio_ai_settings?select=enabled,allow_buy,allow_sell,max_trade_percent,max_daily_trades&portfolio_id=eq.${encodeURIComponent(
          portfolioId
        )}&user_id=eq.${encodeURIComponent(actor.user.id)}&limit=1`,
        { method: "GET" }
      );
      const setting = settings?.[0];
      if (!setting?.enabled) {
        return json(res, 403, { error: "Claude is not enabled for this portfolio." });
      }
      if (side === "buy" && setting.allow_buy === false) {
        return json(res, 403, { error: "Claude buy orders are disabled for this portfolio." });
      }
      if (side === "sell" && setting.allow_sell === false) {
        return json(res, 403, { error: "Claude sell orders are disabled for this portfolio." });
      }
      const since = new Date();
      since.setUTCHours(0, 0, 0, 0);
      const todaysTrades = await actorRequest(
        actor,
        `/rest/v1/portfolio_trades?select=id&portfolio_id=eq.${encodeURIComponent(
          portfolioId
        )}&user_id=eq.${encodeURIComponent(actor.user.id)}&source=eq.ai&created_at=gte.${encodeURIComponent(
          since.toISOString()
        )}`,
        { method: "GET" }
      );
      if ((todaysTrades || []).length >= (Number(setting.max_daily_trades) || 5)) {
        return json(res, 403, { error: "Claude daily trade limit reached for this portfolio." });
      }
    }

    const quote = await quoteForSymbol(symbol);
    const price = quote.regularMarketPrice;
    if (!Number.isFinite(price)) {
      return json(res, 422, { error: `No usable market price for ${symbol}.` });
    }

    const holdingRows = await actorRequest(
      actor,
      `/rest/v1/portfolio_holdings?select=symbol,quantity,avg_cost,name&portfolio_id=eq.${encodeURIComponent(
        portfolioId
      )}&user_id=eq.${encodeURIComponent(actor.user.id)}&symbol=eq.${encodeURIComponent(quote.symbol)}&limit=1`,
      { method: "GET" }
    );
    const holding = holdingRows?.[0] || { symbol: quote.symbol, quantity: 0, avg_cost: 0 };
    let cash = Number(portfolio.cash) || 0;
    let quantity = Number(holding.quantity) || 0;
    let avgCost = Number(holding.avg_cost) || 0;
    let realizedPnl = 0;

    if (side === "buy") {
      const cost = shares * price;
      if (actor.admin) {
        const settings = await actorRequest(
          actor,
          `/rest/v1/portfolio_ai_settings?select=max_trade_percent&portfolio_id=eq.${encodeURIComponent(
            portfolioId
          )}&user_id=eq.${encodeURIComponent(actor.user.id)}&limit=1`,
          { method: "GET" }
        );
        const maxPercent = Number(settings?.[0]?.max_trade_percent) || 10;
        const holdingRowsForValue = await actorRequest(
          actor,
          `/rest/v1/portfolio_holdings?select=symbol,quantity,avg_cost&portfolio_id=eq.${encodeURIComponent(
            portfolioId
          )}&user_id=eq.${encodeURIComponent(actor.user.id)}`,
          { method: "GET" }
        );
        const estimatedHoldings = (holdingRowsForValue || []).reduce(
          (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.avg_cost) || 0),
          0
        );
        const maxTrade = (cash + estimatedHoldings) * (maxPercent / 100);
        if (cost > maxTrade) {
          return json(res, 403, { error: `Claude trade exceeds ${maxPercent}% portfolio limit.` });
        }
      }
      if (cost > cash) {
        return json(res, 400, { error: `Not enough paper cash to buy ${shares} ${quote.symbol}.` });
      }
      const existingCost = quantity * avgCost;
      quantity += shares;
      avgCost = (existingCost + cost) / quantity;
      cash -= cost;
    } else {
      if (shares > quantity) {
        return json(res, 400, { error: `You only have ${quantity.toLocaleString()} ${quote.symbol} shares.` });
      }
      realizedPnl = shares * (price - avgCost);
      quantity -= shares;
      cash += shares * price;
    }

    cash = Math.max(0, Number(cash.toFixed(2)));
    quantity = Math.max(0, Number(quantity.toFixed(6)));
    avgCost = Math.max(0, Number(avgCost.toFixed(4)));

    await actorRequest(actor, `/rest/v1/portfolios?id=eq.${encodeURIComponent(portfolioId)}`, {
      method: "PATCH",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify({ cash, updated_at: new Date().toISOString() })
    });
    if (quantity > 0) {
      await actorRequest(actor, "/rest/v1/portfolio_holdings?on_conflict=portfolio_id,symbol", {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          portfolio_id: portfolioId,
          user_id: actor.user.id,
          symbol: quote.symbol,
          asset_type: "us_stock",
          name: quote.shortName || quote.symbol,
          quantity,
          avg_cost: avgCost,
          updated_at: new Date().toISOString()
        })
      });
    } else {
      await actorRequest(
        actor,
        `/rest/v1/portfolio_holdings?portfolio_id=eq.${encodeURIComponent(portfolioId)}&symbol=eq.${encodeURIComponent(
          quote.symbol
        )}`,
        { method: "DELETE", headers: { prefer: "return=minimal" } }
      );
    }
    if (side === "buy") {
      await actorRequest(
        actor,
        `/rest/v1/portfolio_watchlist?portfolio_id=eq.${encodeURIComponent(portfolioId)}&symbol=eq.${encodeURIComponent(
          quote.symbol
        )}`,
        { method: "DELETE", headers: { prefer: "return=minimal" } }
      );
    }
    await actorRequest(actor, "/rest/v1/portfolio_trades", {
      method: "POST",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify({
        portfolio_id: portfolioId,
        user_id: actor.user.id,
        symbol: quote.symbol,
        asset_type: "us_stock",
        trade_type: side,
        quantity: shares,
        price,
        total: shares * price,
        realized_pnl: realizedPnl,
        source: actor.admin ? "ai" : "manual"
      })
    });

    return json(res, 200, {
      source: "paper-broker",
      trade: {
        symbol: quote.symbol,
        side,
        shares,
        price,
        realizedPnl: Number(realizedPnl.toFixed(2))
      },
      portfolio: {
        id: portfolioId,
        cash
      },
      position: {
        symbol: quote.symbol,
        shares: quantity,
        avgCost
      },
      quote
    });
  } catch (error) {
    const status = error.message === "Missing user session" ? 401 : 500;
    return json(res, status, { error: error.message });
  }
}

async function paperAccountHandler(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { error: "Use GET for paper account." });
  }

  try {
    const actor = await paperActor(req, "paper:read");
    const portfolioId = String(getQuery(req).get("portfolioId") || getQuery(req).get("portfolio_id") || "");
    const portfolioFilter = portfolioId ? `&id=eq.${encodeURIComponent(portfolioId)}` : "";
    const portfolios = await actorRequest(
      actor,
      `/rest/v1/portfolios?select=id,name,account_type,cash,starting_cash,base_currency&user_id=eq.${encodeURIComponent(
        actor.user.id
      )}&archived=eq.false${portfolioFilter}&order=created_at.asc`,
      { method: "GET" }
    );
    const ids = (portfolios || []).map((portfolio) => portfolio.id);
    const positions = ids.length
      ? await actorRequest(
          actor,
          `/rest/v1/portfolio_holdings?select=portfolio_id,symbol,quantity,avg_cost,name&portfolio_id=in.(${ids
            .map(encodeURIComponent)
            .join(",")})&user_id=eq.${encodeURIComponent(actor.user.id)}&order=symbol.asc`,
          { method: "GET" }
        )
      : [];
    const trades = ids.length
      ? await actorRequest(
          actor,
          `/rest/v1/portfolio_trades?select=portfolio_id,symbol,trade_type,quantity,price,realized_pnl,source,created_at&portfolio_id=in.(${ids
            .map(encodeURIComponent)
            .join(",")})&user_id=eq.${encodeURIComponent(actor.user.id)}&order=created_at.desc&limit=50`,
          { method: "GET" }
        )
      : [];

    return json(res, 200, {
      source: "paper-broker",
      portfolios: portfolios || [],
      positions: (positions || []).map((position) => ({
        portfolioId: position.portfolio_id,
        symbol: cleanSymbol(position.symbol),
        name: position.name || cleanSymbol(position.symbol),
        shares: Number(position.quantity) || 0,
        avgCost: Number(position.avg_cost) || 0
      })),
      trades: trades || []
    });
  } catch (error) {
    const status = error.message === "Missing user session" ? 401 : 500;
    return json(res, status, { error: error.message });
  }
}

async function clearPaperTradesHandler(req, res) {
  if (req.method !== "POST" && req.method !== "DELETE") {
    return json(res, 405, { error: "Use POST or DELETE to clear paper trades." });
  }

  try {
    const actor = await paperActor(req, "paper:trade");
    const portfolioId = String((req.method === "POST" ? (await readJsonBody(req)).portfolioId : getQuery(req).get("portfolioId")) || "");
    const portfolioFilter = portfolioId ? `&portfolio_id=eq.${encodeURIComponent(portfolioId)}` : "";
    await actorRequest(
      actor,
      `/rest/v1/portfolio_trades?user_id=eq.${encodeURIComponent(actor.user.id)}${portfolioFilter}`,
      {
        method: "DELETE",
        headers: { prefer: "return=minimal" }
      }
    );

    return json(res, 200, { ok: true });
  } catch (error) {
    const status = error.message === "Missing user session" ? 401 : 500;
    return json(res, status, { error: error.message });
  }
}

async function listApiKeysHandler(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { error: "Use GET for API keys." });
  }

  try {
    const actor = await sessionActor(req);
    const keys = await supabaseRequest(
      `/rest/v1/api_keys?select=id,name,key_prefix,permissions,status,last_used_at,created_at,revoked_at&user_id=eq.${encodeURIComponent(
        actor.user.id
      )}&status=eq.active&order=created_at.desc`,
      actor.token,
      { method: "GET" }
    );
    return json(res, 200, { keys: keys || [] });
  } catch (error) {
    const status = error.message === "Missing user session" ? 401 : 500;
    return json(res, status, { error: error.message });
  }
}

async function createApiKeyHandler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Use POST to create API keys." });
  }

  try {
    const actor = await sessionActor(req);
    const body = await readJsonBody(req);
    const name = String(body.name || "Claude paper key").trim().slice(0, 80) || "Claude paper key";
    const credentials = generatePaperCredentials();
    const permissions = ["paper:read", "paper:trade"];

    const rows = await supabaseRequest("/rest/v1/api_keys?select=id,name,key_prefix,permissions,status,created_at", actor.token, {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        user_id: actor.user.id,
        name,
        key_prefix: credentials.key,
        secret_hash: hashSecret(credentials.secret),
        permissions,
        status: "active"
      })
    });

    return json(res, 201, {
      key: rows?.[0],
      credentials: {
        endpoint: `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`,
        key: credentials.key,
        secret: credentials.secret
      }
    });
  } catch (error) {
    const status = error.message === "Missing user session" ? 401 : 500;
    return json(res, status, { error: error.message });
  }
}

async function revokeApiKeyHandler(req, res) {
  if (req.method !== "POST" && req.method !== "DELETE") {
    return json(res, 405, { error: "Use POST or DELETE to revoke API keys." });
  }

  try {
    const actor = await sessionActor(req);
    const body = req.method === "POST" ? await readJsonBody(req) : {};
    const id = String(body.id || getQuery(req).get("id") || "");
    if (!id) {
      return json(res, 400, { error: "Missing API key id." });
    }

    await supabaseRequest(
      `/rest/v1/api_keys?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(actor.user.id)}`,
      actor.token,
      {
        method: "DELETE",
        headers: { prefer: "return=minimal" }
      }
    );

    return json(res, 200, { ok: true, removed: true });
  } catch (error) {
    const status = error.message === "Missing user session" ? 401 : 500;
    return json(res, status, { error: error.message });
  }
}

function configHandler(req, res) {
  return json(res, 200, {
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
    paperApiKeysEnabled: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    twelveDataEnabled: Boolean(process.env.TWELVE_DATA_API_KEY)
  });
}

async function staticHandler(req, res) {
  const requestPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  const safePath = normalize(requestPath === "/" ? "/index.html" : requestPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(PUBLIC_DIR, safePath);

  try {
    const body = await readFile(filePath);
    res.writeHead(200, {
      "content-type": MIME_TYPES[extname(filePath)] || "application/octet-stream",
      "cache-control": "no-cache"
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const path = new URL(req.url, `http://${req.headers.host}`).pathname;

    if (path === "/api/quotes") return quotesHandler(req, res);
    if (path === "/api/search") return searchHandler(req, res);
    if (path === "/api/performance") return performanceHandler(req, res);
    if (path === "/api/history") return historyHandler(req, res);
    if (path === "/api/news") return newsHandler(req, res);
    if (path === "/api/keys") return listApiKeysHandler(req, res);
    if (path === "/api/keys/create") return createApiKeyHandler(req, res);
    if (path === "/api/keys/revoke") return revokeApiKeyHandler(req, res);
    if (path === "/api/paper/account") return paperAccountHandler(req, res);
    if (path === "/api/paper/trade") return paperTradeHandler(req, res);
    if (path === "/api/paper/trades/clear") return clearPaperTradesHandler(req, res);
    if (path === "/api/config") return configHandler(req, res);

    return staticHandler(req, res);
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Stock dashboard running at http://localhost:${PORT}`);
});
