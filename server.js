import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = join(process.cwd(), "public");

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
    .replace(/[^A-Z0-9.^-]/g, "")
    .slice(0, 12);

const getQuery = (req) => new URL(req.url, `http://${req.headers.host}`).searchParams;

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
    source: "Demo fallback"
  };
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
    source: "Yahoo chart"
  };
}

async function resolveYahooSymbol(symbol) {
  const endpoint = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
    symbol
  )}&quotesCount=8&newsCount=0`;
  const data = await fetchJson(endpoint);
  const quotes = Array.isArray(data?.quotes) ? data.quotes : [];
  const match =
    quotes.find((quote) => quote.quoteType === "EQUITY" && cleanSymbol(quote.symbol).startsWith(symbol)) ||
    quotes.find((quote) => quote.quoteType === "EQUITY") ||
    quotes[0];

  return cleanSymbol(match?.symbol);
}

async function quoteForSymbol(symbol) {
  const chartEndpoint = (nextSymbol) =>
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      nextSymbol
    )}?range=1d&interval=1m&includePrePost=true`;

  try {
    const data = await fetchJson(chartEndpoint(symbol));
    return quoteFromChart(symbol, data);
  } catch (error) {
    const resolvedSymbol = await resolveYahooSymbol(symbol);
    if (!resolvedSymbol || resolvedSymbol === symbol) {
      throw error;
    }

    const data = await fetchJson(chartEndpoint(resolvedSymbol));
    return quoteFromChart(resolvedSymbol, data, symbol);
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

async function quotesHandler(req, res) {
  const symbols = (getQuery(req).get("symbols") || "AAPL,MSFT,NVDA")
    .split(",")
    .map(cleanSymbol)
    .filter(Boolean)
    .slice(0, 20);

  if (!symbols.length) {
    return json(res, 400, { error: "Add at least one stock symbol." });
  }

  try {
    const quoteResults = await Promise.allSettled(
      symbols.map((symbol) => quoteForSymbol(symbol))
    );

    const quotes = quoteResults.map((result, index) =>
      result.status === "fulfilled" ? result.value : demoQuote(symbols[index], index)
    );
    const failed = quoteResults.filter((result) => result.status === "rejected").length;

    return json(res, 200, {
      source: failed ? "mixed" : "yahoo-chart",
      warning: failed ? `${failed} symbol(s) could not be refreshed and are showing demo fallback.` : null,
      quotes
    });
  } catch (error) {
    return json(res, 200, {
      source: "demo",
      warning: error.message,
      quotes: symbols.map(demoQuote)
    });
  }
}

async function historyHandler(req, res) {
  const query = getQuery(req);
  const symbol = cleanSymbol(query.get("symbol"));
  const config = getHistoryConfig(query);

  if (!symbol) {
    return json(res, 400, { error: "Missing stock symbol." });
  }

  try {
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
      history: demoHistory(symbol, config)
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

function configHandler(req, res) {
  return json(res, 200, {
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ""
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
    if (path === "/api/history") return historyHandler(req, res);
    if (path === "/api/news") return newsHandler(req, res);
    if (path === "/api/config") return configHandler(req, res);

    return staticHandler(req, res);
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Stock dashboard running at http://localhost:${PORT}`);
});
