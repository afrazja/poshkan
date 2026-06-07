const STARTING_CASH = 100000;
const POPULAR_STOCKS = ["AAPL", "NVDA", "MSFT", "TSLA", "AMZN", "GOOGL", "META", "AMD"];
const POPULAR_FOREX = ["EUR/USD", "GBP/USD", "USD/JPY", "USD/CAD", "AUD/USD", "USD/CHF"];
const POPULAR_CRYPTO = ["BTC/USD", "ETH/USD", "XRP/USD"];
const PERIODS = {
  "1d": "1D",
  "5d": "5D",
  "1mo": "1M",
  "6mo": "6M",
  "1y": "1Y"
};

const state = {
  supabase: null,
  session: null,
  user: null,
  page: "portfolios",
  portfolioTab: "overview",
  stockTab: "chart",
  authMode: "signin",
  portfolios: [],
  holdings: new Map(),
  watchlist: new Map(),
  trades: new Map(),
  aiSettings: new Map(),
  quotes: new Map(),
  performance: new Map(),
  selectedPortfolioId: localStorage.getItem("poshkan-active-portfolio") || null,
  selectedSymbol: null,
  selectedSearchAsset: null,
  chartPeriod: "1mo",
  chartPoints: [],
  searchResults: [],
  holdingsSort: "symbol",
  holdingsDirection: "asc",
  watchlistSort: "symbol",
  watchlistDirection: "asc",
  compareSort: "symbol",
  compareDirection: "asc",
  compareAmount: 4,
  compareUnit: "days",
  comparePeriodLabel: "4 days",
  apiKeys: [],
  config: null,
  loading: false
};

const elements = {
  authPanel: document.querySelector("#auth-panel"),
  authForm: document.querySelector("#auth-form"),
  authTitle: document.querySelector("#auth-title"),
  authEmail: document.querySelector("#auth-email"),
  authPassword: document.querySelector("#auth-password"),
  authUsername: document.querySelector("#auth-username"),
  signupFields: document.querySelector("#signup-fields"),
  authSubmit: document.querySelector("#auth-submit"),
  authMessage: document.querySelector("#auth-message"),
  authModeButtons: document.querySelectorAll("[data-auth-mode]"),
  appShell: document.querySelector("#app-shell"),
  accountName: document.querySelector("#account-name"),
  signOut: document.querySelector("#sign-out"),
  settingsButton: document.querySelector("#settings-button"),
  status: document.querySelector("#app-status"),
  navButtons: document.querySelectorAll("[data-nav]"),
  views: {
    portfolios: document.querySelector("#portfolios-view"),
    portfolio: document.querySelector("#portfolio-view"),
    stock: document.querySelector("#stock-view"),
    compare: document.querySelector("#compare-view"),
    history: document.querySelector("#history-view"),
    ai: document.querySelector("#ai-view"),
    settings: document.querySelector("#settings-view")
  },
  dialog: document.querySelector("#portfolio-dialog"),
  portfolioForm: document.querySelector("#portfolio-form"),
  portfolioName: document.querySelector("#portfolio-name"),
  portfolioType: document.querySelector("#portfolio-type"),
  portfolioCash: document.querySelector("#portfolio-cash"),
  portfolioStartingHoldings: document.querySelector("#portfolio-starting-holdings"),
  portfolioMessage: document.querySelector("#portfolio-message")
};

const SIGNED_IN_PAGES = new Set(["portfolios", "portfolio", "stock", "compare", "history", "ai", "settings"]);

const moneyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });

function cleanSymbol(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9.^/-]/g, "")
    .slice(0, 16);
}

function normalizeForexSymbol(value) {
  const clean = cleanSymbol(value);
  if (clean.includes("/")) return clean;
  const letters = clean.replace(/[^A-Z]/g, "");
  return letters.length === 6 ? `${letters.slice(0, 3)}/${letters.slice(3)}` : clean;
}

function normalizeCryptoSymbol(value) {
  const clean = cleanSymbol(value);
  if (clean.includes("/")) return clean;
  const letters = clean.replace(/[^A-Z]/g, "");
  if (letters === "BTC" || letters === "BITCOIN") return "BTC/USD";
  if (letters === "ETH" || letters === "ETHEREUM") return "ETH/USD";
  if (letters === "XRP" || letters === "RIPPLE") return "XRP/USD";
  return `${letters}/USD`;
}

function assetLabel(type) {
  if (type === "forex") return "Forex";
  if (type === "crypto") return "Crypto";
  return "US Stocks";
}

function assetTypeForPortfolio(portfolio = activePortfolio()) {
  if (portfolio?.account_type === "forex" || portfolio?.account_type === "crypto") return portfolio.account_type;
  return "us_stock";
}

function normalizeAssetSymbol(value, assetType = assetTypeForPortfolio()) {
  if (assetType === "forex") return normalizeForexSymbol(value);
  if (assetType === "crypto") return normalizeCryptoSymbol(value);
  return cleanSymbol(value);
}

function money(value) {
  return Number.isFinite(Number(value)) ? moneyFormatter.format(Number(value)) : "--";
}

function signedMoney(value) {
  if (!Number.isFinite(Number(value))) return "--";
  return `${Number(value) >= 0 ? "+" : "-"}${money(Math.abs(Number(value)))}`;
}

function signedPercent(value) {
  if (!Number.isFinite(Number(value))) return "--";
  const sign = Number(value) >= 0 ? "+" : "";
  return `${sign}${Number(value).toFixed(2)}%`;
}

function number(value) {
  return Number.isFinite(Number(value)) ? numberFormatter.format(Number(value)) : "--";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setStatus(message, type = "") {
  elements.status.textContent = friendlyError(message);
  elements.status.className = `app-status ${type}`.trim();
}

function friendlyError(message) {
  const text = String(message || "");
  if (text.includes("row-level security") || text.includes("violates row-level security")) {
    return "Database permissions need updating. Run supabase-portfolio-redesign.sql in Supabase, then try again.";
  }
  if (
    text.includes("portfolios_account_type_check") ||
    text.includes("portfolio_holdings_asset_type_check") ||
    text.includes("portfolio_watchlist_asset_type_check") ||
    text.includes("portfolio_trades_asset_type_check")
  ) {
    return "Database schema needs updating. Run supabase-portfolio-redesign.sql in Supabase so Forex accounts are allowed.";
  }
  return text;
}

function setPortfolioMessage(message, type = "") {
  if (!elements.portfolioMessage) return;
  elements.portfolioMessage.textContent = friendlyError(message);
  elements.portfolioMessage.className = `form-message ${type}`.trim();
}

function throwIfSupabaseError(result) {
  if (result?.error) throw result.error;
  return result;
}

function activePortfolio() {
  return state.portfolios.find((portfolio) => portfolio.id === state.selectedPortfolioId) || state.portfolios[0] || null;
}

function defaultSignedInPage() {
  return state.selectedPortfolioId ? "portfolio" : "portfolios";
}

function keepOrSetSignedInPage({ force = false } = {}) {
  const hasPortfolio = Boolean(activePortfolio());
  const invalidPage =
    !SIGNED_IN_PAGES.has(state.page) ||
    (state.page !== "portfolios" && !hasPortfolio) ||
    (state.page === "stock" && !state.selectedSymbol);

  if (force || invalidPage) {
    state.page = defaultSignedInPage();
  }
}

function portfolioHoldings(portfolioId = state.selectedPortfolioId) {
  return state.holdings.get(portfolioId) || [];
}

function portfolioWatchlist(portfolioId = state.selectedPortfolioId) {
  return state.watchlist.get(portfolioId) || [];
}

function portfolioTrades(portfolioId = state.selectedPortfolioId) {
  return state.trades.get(portfolioId) || [];
}

function quoteFor(symbol) {
  return state.quotes.get(cleanSymbol(symbol));
}

function holdingStats(holding) {
  const quote = quoteFor(holding.symbol);
  const price = Number(quote?.regularMarketPrice);
  const quantity = Number(holding.quantity) || 0;
  const avgCost = Number(holding.avg_cost) || 0;
  const value = Number.isFinite(price) ? quantity * price : quantity * avgCost;
  const cost = quantity * avgCost;
  const totalPnl = value - cost;
  const totalPnlPercent = cost > 0 ? (totalPnl / cost) * 100 : 0;
  const dayChange = Number(quote?.regularMarketChange) || 0;
  const dayPnl = dayChange * quantity;
  return { price, quantity, avgCost, value, cost, totalPnl, totalPnlPercent, dayPnl, quote };
}

function portfolioSummary(portfolio = activePortfolio()) {
  if (!portfolio) return { cash: 0, holdingsValue: 0, totalValue: 0, invested: 0, totalPnl: 0, todayPnl: 0 };
  const holdings = portfolioHoldings(portfolio.id);
  const totals = holdings.reduce(
    (sum, holding) => {
      const stats = holdingStats(holding);
      sum.holdingsValue += stats.value;
      sum.invested += stats.cost;
      sum.totalPnl += stats.totalPnl;
      sum.todayPnl += stats.dayPnl;
      return sum;
    },
    { holdingsValue: 0, invested: 0, totalPnl: 0, todayPnl: 0 }
  );
  const cash = Number(portfolio.cash) || 0;
  return { ...totals, cash, totalValue: cash + totals.holdingsValue };
}

function allSymbols(portfolioId = state.selectedPortfolioId) {
  return [
    ...new Set([
      ...portfolioHoldings(portfolioId).map((holding) => cleanSymbol(holding.symbol)),
      ...portfolioWatchlist(portfolioId).map((item) => cleanSymbol(item.symbol))
    ])
  ].filter(Boolean);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || `Request failed: ${response.status}`);
  return data;
}

async function loadConfig() {
  state.config = await fetchJson("/api/config");
  if (!state.config.supabaseUrl || !state.config.supabaseAnonKey) {
    throw new Error("Supabase environment keys are missing on the server.");
  }
  state.supabase = window.supabase.createClient(state.config.supabaseUrl, state.config.supabaseAnonKey);
}

async function loadQuotes(symbols = allSymbols(), assetType = assetTypeForPortfolio()) {
  const clean = [...new Set(symbols.map((symbol) => normalizeAssetSymbol(symbol, assetType)).filter(Boolean))];
  if (!clean.length) return;
  const data = await fetchJson(`/api/quotes?symbols=${encodeURIComponent(clean.join(","))}&type=${encodeURIComponent(assetType)}`);
  (data.quotes || []).forEach((quote) => state.quotes.set(cleanSymbol(quote.symbol), quote));
  if (data.invalids?.length) {
    setStatus(`${data.invalids.length} symbol could not be refreshed.`, "warning");
  }
}

async function searchAssets(query) {
  const q = String(query || "").trim();
  if (q.length < 1) {
    state.searchResults = [];
    render();
    return;
  }
  const assetType = assetTypeForPortfolio();
  const data = await fetchJson(`/api/search?q=${encodeURIComponent(q)}&type=${encodeURIComponent(assetType)}`);
  state.searchResults = data.suggestions || [];
  await loadQuotes(state.searchResults.map((item) => item.symbol), assetType);
  render();
}

async function loadCloudData() {
  const userId = state.session.user.id;
  await state.supabase.from("profiles").upsert({
    id: userId,
    email: state.session.user.email,
    display_name: state.session.user.user_metadata?.display_name || state.session.user.user_metadata?.username || null
  });

  const { data: profile } = await state.supabase
    .from("profiles")
    .select("last_active_portfolio_id, display_name")
    .eq("id", userId)
    .maybeSingle();
  const { data: portfolios, error: portfolioError } = await state.supabase
    .from("portfolios")
    .select("*")
    .eq("user_id", userId)
    .eq("archived", false)
    .order("created_at", { ascending: true });
  if (portfolioError) throw portfolioError;

  state.portfolios = portfolios || [];
  const ids = state.portfolios.map((portfolio) => portfolio.id);
  state.holdings = new Map(ids.map((id) => [id, []]));
  state.watchlist = new Map(ids.map((id) => [id, []]));
  state.trades = new Map(ids.map((id) => [id, []]));
  state.aiSettings = new Map(ids.map((id) => [id, null]));

  if (ids.length) {
    const [holdingsResult, watchlistResult, tradesResult, aiResult] = await Promise.all([
      state.supabase.from("portfolio_holdings").select("*").in("portfolio_id", ids).order("symbol"),
      state.supabase.from("portfolio_watchlist").select("*").in("portfolio_id", ids).order("sort_order"),
      state.supabase.from("portfolio_trades").select("*").in("portfolio_id", ids).order("created_at", { ascending: false }),
      state.supabase.from("portfolio_ai_settings").select("*").in("portfolio_id", ids)
    ]);
    if (holdingsResult.error) throw holdingsResult.error;
    if (watchlistResult.error) throw watchlistResult.error;
    if (tradesResult.error) throw tradesResult.error;
    if (aiResult.error) throw aiResult.error;

    (holdingsResult.data || []).forEach((holding) => state.holdings.get(holding.portfolio_id)?.push(holding));
    (watchlistResult.data || []).forEach((item) => state.watchlist.get(item.portfolio_id)?.push(item));
    (tradesResult.data || []).forEach((trade) => state.trades.get(trade.portfolio_id)?.push(trade));
    (aiResult.data || []).forEach((setting) => state.aiSettings.set(setting.portfolio_id, setting));
  }

  const preferred = localStorage.getItem("poshkan-active-portfolio") || profile?.last_active_portfolio_id;
  state.selectedPortfolioId = state.portfolios.some((portfolio) => portfolio.id === preferred)
    ? preferred
    : state.portfolios[0]?.id || null;
  elements.accountName.textContent = profile?.display_name || state.session.user.email || "Account";
  await Promise.all(
    state.portfolios.map((portfolio) => loadQuotes(allSymbols(portfolio.id), assetTypeForPortfolio(portfolio)))
  );
}

async function saveLastActivePortfolio() {
  if (!state.session || !state.selectedPortfolioId) return;
  localStorage.setItem("poshkan-active-portfolio", state.selectedPortfolioId);
  await state.supabase
    .from("profiles")
    .update({ last_active_portfolio_id: state.selectedPortfolioId, updated_at: new Date().toISOString() })
    .eq("id", state.session.user.id);
}

function parseStartingHoldings(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => {
      const [symbol, quantity, avgCost] = line.split(",").map((part) => part.trim());
      const clean = cleanSymbol(symbol);
      const qty = Number(quantity);
      const cost = Number(avgCost);
      if (!clean || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(cost) || cost < 0) return null;
      return { symbol: clean, quantity: qty, avgCost: cost };
    })
    .filter(Boolean);
}

async function createPortfolio(event) {
  event.preventDefault();
  const submit = elements.portfolioForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  setPortfolioMessage("Creating portfolio...", "success");
  const userId = state.session.user.id;
  const name = elements.portfolioName.value.trim();
  const accountType = elements.portfolioType.value;
  const cashInput = String(elements.portfolioCash.value).trim();
  const cash = cashInput === "" ? STARTING_CASH : Math.max(0, Number(cashInput) || 0);
  if (!name) {
    setPortfolioMessage("Enter a portfolio name.", "warning");
    submit.disabled = false;
    return;
  }
  const { data, error } = await state.supabase
    .from("portfolios")
    .insert({ user_id: userId, name, account_type: accountType, starting_cash: cash, cash })
    .select()
    .single();
  if (error) throw error;

  const portfolio = data;
  const starting = parseStartingHoldings(elements.portfolioStartingHoldings.value);
  if (starting.length) {
    const symbols = starting.map((item) => normalizeAssetSymbol(item.symbol, accountType));
    await loadQuotes(symbols, accountType);
    const holdings = starting.map((item) => ({
      portfolio_id: portfolio.id,
      user_id: userId,
      symbol: normalizeAssetSymbol(item.symbol, accountType),
      asset_type: accountType,
      name: quoteFor(normalizeAssetSymbol(item.symbol, accountType))?.shortName || item.symbol,
      quantity: item.quantity,
      avg_cost: item.avgCost
    }));
    const trades = starting.map((item) => ({
      portfolio_id: portfolio.id,
      user_id: userId,
      symbol: normalizeAssetSymbol(item.symbol, accountType),
      asset_type: accountType,
      trade_type: "starting_position",
      quantity: item.quantity,
      price: item.avgCost,
      total: item.quantity * item.avgCost,
      source: "manual"
    }));
    const holdingResult = await state.supabase.from("portfolio_holdings").insert(holdings);
    if (holdingResult.error) throw holdingResult.error;
    const tradeResult = await state.supabase.from("portfolio_trades").insert(trades);
    if (tradeResult.error) throw tradeResult.error;
  }

  await state.supabase.from("portfolio_ai_settings").insert({ portfolio_id: portfolio.id, user_id: userId });
  elements.dialog.close();
  elements.portfolioForm.reset();
  elements.portfolioCash.value = STARTING_CASH;
  state.selectedPortfolioId = portfolio.id;
  state.page = "portfolio";
  state.portfolioTab = "overview";
  await loadCloudData();
  await saveLastActivePortfolio();
  render();
  setPortfolioMessage("");
  submit.disabled = false;
}

async function archivePortfolio(id) {
  const portfolio = state.portfolios.find((item) => item.id === id);
  if (!portfolio) return;
  if (!window.confirm(`Archive "${portfolio.name}"?`)) return;
  const { error } = await state.supabase.from("portfolios").update({ archived: true }).eq("id", id);
  if (error) throw error;
  await loadCloudData();
  state.page = state.portfolios.length ? "portfolios" : "portfolios";
  render();
}

async function addToWatchlist(asset = state.selectedSearchAsset) {
  const portfolio = activePortfolio();
  if (!portfolio || !asset) return;
  const assetType = assetTypeForPortfolio(portfolio);
  const symbol = normalizeAssetSymbol(asset.symbol, assetType);
  if (portfolioHoldings().some((holding) => holding.symbol === symbol)) {
    setStatus(`${symbol} is already in holdings.`, "warning");
    return;
  }
  if (portfolioWatchlist().some((item) => item.symbol === symbol)) {
    setStatus(`${symbol} is already in watchlist.`, "warning");
    return;
  }
  const { error } = await state.supabase.from("portfolio_watchlist").insert({
    portfolio_id: portfolio.id,
    user_id: state.session.user.id,
    symbol,
    asset_type: assetType,
    name: asset.name || quoteFor(symbol)?.shortName || symbol,
    sort_order: portfolioWatchlist().length
  });
  if (error) throw error;
  state.searchResults = [];
  state.selectedSearchAsset = null;
  await loadCloudData();
  render();
  setStatus(`${symbol} added to watchlist.`, "success");
}

async function setStartingHolding(symbol, quantity, avgCost) {
  const portfolio = activePortfolio();
  if (portfolio?.account_type === "forex") {
    setStatus("Forex starting positions are tracked in watchlist first. Lot and pip position rules are next.", "warning");
    return;
  }
  const clean = cleanSymbol(symbol);
  const qty = Math.max(0, Number(quantity) || 0);
  const cost = Math.max(0, Number(avgCost) || 0);
  if (!portfolio || !clean || qty <= 0) return;
  await loadQuotes([clean], assetTypeForPortfolio(portfolio));
  const userId = state.session.user.id;
  const { error } = await state.supabase.from("portfolio_holdings").upsert(
    {
      portfolio_id: portfolio.id,
      user_id: userId,
      symbol: clean,
      asset_type: "us_stock",
      name: quoteFor(clean)?.shortName || clean,
      quantity: qty,
      avg_cost: cost,
      updated_at: new Date().toISOString()
    },
    { onConflict: "portfolio_id,symbol" }
  );
  if (error) throw error;
  throwIfSupabaseError(await state.supabase.from("portfolio_watchlist").delete().eq("portfolio_id", portfolio.id).eq("symbol", clean));
  throwIfSupabaseError(await state.supabase.from("portfolio_trades").insert({
    portfolio_id: portfolio.id,
    user_id: userId,
    symbol: clean,
    asset_type: "us_stock",
    trade_type: "starting_position",
    quantity: qty,
    price: cost,
    total: qty * cost,
    source: "manual"
  }));
  await loadCloudData();
  render();
  setStatus(`${clean} starting holding saved.`, "success");
}

async function executeTrade(symbol, side, quantity) {
  const portfolio = activePortfolio();
  if (portfolio?.account_type === "forex" || portfolio?.account_type === "crypto") {
    setStatus(`${portfolio.account_type === "forex" ? "Forex" : "Crypto"} paper orders need a dedicated position model. This stage adds quotes and charts first.`, "warning");
    return;
  }
  const clean = cleanSymbol(symbol);
  const qty = Math.max(0, Number(quantity) || 0);
  if (!portfolio || !clean || !qty) {
    setStatus("Enter a symbol and quantity.", "warning");
    return;
  }
  await loadQuotes([clean], assetTypeForPortfolio(portfolio));
  const quote = quoteFor(clean);
  const price = Number(quote?.regularMarketPrice);
  if (!Number.isFinite(price) || price <= 0) {
    setStatus(`No usable live price for ${clean}.`, "warning");
    return;
  }
  const userId = state.session.user.id;
  const current = portfolioHoldings().find((holding) => holding.symbol === clean) || null;
  let cash = Number(portfolio.cash) || 0;
  let realizedPnl = 0;

  if (side === "buy") {
    const total = qty * price;
    if (total > cash) {
      setStatus(`Not enough cash to buy ${qty} ${clean}.`, "warning");
      return;
    }
    const oldQty = Number(current?.quantity) || 0;
    const oldCost = oldQty * (Number(current?.avg_cost) || 0);
    const newQty = oldQty + qty;
    const avgCost = newQty ? (oldCost + total) / newQty : 0;
    const { error } = await state.supabase.from("portfolio_holdings").upsert(
      {
        portfolio_id: portfolio.id,
        user_id: userId,
        symbol: clean,
        asset_type: "us_stock",
        name: quote.shortName || clean,
        quantity: Number(newQty.toFixed(6)),
        avg_cost: Number(avgCost.toFixed(4)),
        updated_at: new Date().toISOString()
      },
      { onConflict: "portfolio_id,symbol" }
    );
    if (error) throw error;
    throwIfSupabaseError(await state.supabase.from("portfolio_watchlist").delete().eq("portfolio_id", portfolio.id).eq("symbol", clean));
    cash -= total;
  } else {
    const oldQty = Number(current?.quantity) || 0;
    if (!current || qty > oldQty) {
      setStatus(`You only have ${number(oldQty)} ${clean}.`, "warning");
      return;
    }
    realizedPnl = qty * (price - Number(current.avg_cost));
    const newQty = oldQty - qty;
    if (newQty <= 0) {
      throwIfSupabaseError(await state.supabase.from("portfolio_holdings").delete().eq("portfolio_id", portfolio.id).eq("symbol", clean));
    } else {
      throwIfSupabaseError(
        await state.supabase
          .from("portfolio_holdings")
          .update({ quantity: Number(newQty.toFixed(6)), updated_at: new Date().toISOString() })
          .eq("portfolio_id", portfolio.id)
          .eq("symbol", clean)
      );
    }
    cash += qty * price;
  }

  throwIfSupabaseError(
    await state.supabase
      .from("portfolios")
      .update({ cash: Number(cash.toFixed(2)), updated_at: new Date().toISOString() })
      .eq("id", portfolio.id)
  );
  throwIfSupabaseError(await state.supabase.from("portfolio_trades").insert({
    portfolio_id: portfolio.id,
    user_id: userId,
    symbol: clean,
    asset_type: "us_stock",
    trade_type: side,
    quantity: qty,
    price,
    total: qty * price,
    realized_pnl: Number(realizedPnl.toFixed(2)),
    source: "manual"
  }));
  await loadCloudData();
  state.selectedSymbol = clean;
  state.page = "stock";
  state.stockTab = "trade";
  render();
  setStatus(`${side === "buy" ? "Bought" : "Sold"} ${qty} ${clean} at ${money(price)}.`, "success");
}

async function deleteWatchlistSymbol(symbol) {
  const portfolio = activePortfolio();
  if (!portfolio) return;
  throwIfSupabaseError(
    await state.supabase.from("portfolio_watchlist").delete().eq("portfolio_id", portfolio.id).eq("symbol", cleanSymbol(symbol))
  );
  await loadCloudData();
  render();
}

async function loadStockDetail(symbol) {
  const clean = normalizeAssetSymbol(symbol);
  state.selectedSymbol = clean;
  state.page = "stock";
  state.stockTab = "chart";
  await loadQuotes([clean], assetTypeForPortfolio());
  await loadChart(clean);
  render();
}

async function loadChart(symbol = state.selectedSymbol) {
  if (!symbol) return;
  const data = await fetchJson(`/api/history?symbol=${encodeURIComponent(symbol)}&period=${encodeURIComponent(state.chartPeriod)}&type=${encodeURIComponent(assetTypeForPortfolio())}`);
  state.chartPoints = data.history || [];
}

async function loadNews(symbol = state.selectedSymbol) {
  if (!symbol || state.news?.symbol === symbol) return;
  state.news = await fetchJson(`/api/news?symbol=${encodeURIComponent(symbol)}`);
}

async function loadPerformance() {
  const portfolio = activePortfolio();
  if (!portfolio) return;
  const symbols = allSymbols(portfolio.id);
  if (!symbols.length) return;
  const heldSince = portfolioHoldings(portfolio.id)
    .map((holding) => `${holding.symbol}:${Math.floor(new Date(holding.opened_at || Date.now()).getTime() / 1000)}`)
    .join(",");
  const amount = Math.max(1, Number.parseInt(state.compareAmount, 10) || 1);
  const unit = ["hours", "days", "months"].includes(state.compareUnit) ? state.compareUnit : "days";
  const data = await fetchJson(
    `/api/performance?symbols=${encodeURIComponent(symbols.join(","))}&amount=${encodeURIComponent(amount)}&unit=${encodeURIComponent(unit)}&heldSince=${encodeURIComponent(heldSince)}&type=${encodeURIComponent(assetTypeForPortfolio(portfolio))}`
  );
  state.compareAmount = amount;
  state.compareUnit = unit;
  state.comparePeriodLabel = data.periodLabel || `${amount} ${unit}`;
  state.performance = new Map((data.performance || []).map((item) => [cleanSymbol(item.symbol), item]));
}

async function loadApiKeys() {
  if (!state.session) return;
  try {
    const data = await fetchJson("/api/keys", { headers: { authorization: `Bearer ${state.session.access_token}` } });
    state.apiKeys = data.keys || [];
  } catch (error) {
    setStatus(error.message, "warning");
  }
}

async function createApiKey() {
  const data = await fetchJson("/api/keys/create", {
    method: "POST",
    headers: { authorization: `Bearer ${state.session.access_token}`, "content-type": "application/json" },
    body: JSON.stringify({ name: "Claude portfolio key" })
  });
  await loadApiKeys();
  render();
  const box = document.querySelector("#new-api-secret");
  if (box) {
    box.hidden = false;
    box.textContent = `Endpoint: ${data.credentials?.endpoint || location.origin}/api/paper/trade\nKey: ${
      data.credentials?.key || ""
    }\nSecret: ${data.credentials?.secret || ""}`;
  }
}

async function revokeApiKey(id) {
  await fetchJson("/api/keys/revoke", {
    method: "POST",
    headers: { authorization: `Bearer ${state.session.access_token}`, "content-type": "application/json" },
    body: JSON.stringify({ id })
  });
  await loadApiKeys();
  render();
}

async function updateAiSetting(portfolioId, patch) {
  const existing = state.aiSettings.get(portfolioId);
  const payload = {
    portfolio_id: portfolioId,
    user_id: state.session.user.id,
    enabled: existing?.enabled || false,
    allow_buy: existing?.allow_buy ?? true,
    allow_sell: existing?.allow_sell ?? true,
    max_trade_percent: Number(existing?.max_trade_percent) || 10,
    max_daily_trades: Number(existing?.max_daily_trades) || 5,
    ...patch,
    updated_at: new Date().toISOString()
  };
  const { error } = await state.supabase.from("portfolio_ai_settings").upsert(payload);
  if (error) throw error;
  await loadCloudData();
  render();
}

function navigate(page) {
  state.page = page;
  if (page === "portfolio" && !activePortfolio()) state.page = "portfolios";
  render();
}

function selectPortfolio(id) {
  state.selectedPortfolioId = id;
  state.page = "portfolio";
  state.portfolioTab = "overview";
  saveLastActivePortfolio();
  render();
}

function render() {
  const signedIn = Boolean(state.session);
  elements.authPanel.hidden = signedIn;
  elements.appShell.hidden = !signedIn;
  if (!signedIn) return;

  Object.entries(elements.views).forEach(([name, view]) => {
    view.hidden = name !== state.page;
  });
  elements.navButtons.forEach((button) => {
    const target = button.dataset.nav;
    button.classList.toggle("active", target === state.page || (target === "portfolios" && state.page === "portfolio"));
  });

  renderPortfolios();
  renderPortfolio();
  renderStock();
  renderCompare();
  renderHistory();
  renderAi();
  renderSettings();
}

function portfolioCard(portfolio) {
  const summary = portfolioSummary(portfolio);
  return `
    <article class="portfolio-card" data-portfolio-id="${portfolio.id}">
      <div>
        <span class="pill">${assetLabel(portfolio.account_type)}</span>
        <h3>${escapeHtml(portfolio.name)}</h3>
        <p>${portfolioHoldings(portfolio.id).length} holdings • ${portfolioWatchlist(portfolio.id).length} watchlist</p>
      </div>
      <div class="portfolio-card-values">
        <strong>${money(summary.totalValue)}</strong>
        <span class="${summary.totalPnl >= 0 ? "positive" : "negative"}">${signedMoney(summary.totalPnl)}</span>
      </div>
      <div class="row-actions">
        <button type="button" data-action="open-portfolio" data-id="${portfolio.id}" title="Open this portfolio">Open</button>
        <button type="button" data-action="archive-portfolio" data-id="${portfolio.id}" title="Archive this portfolio">Archive</button>
      </div>
    </article>
  `;
}

function renderPortfolios() {
  const view = elements.views.portfolios;
  if (!state.portfolios.length) {
    view.innerHTML = `
      <section class="empty-state">
        <button class="plus-orb" type="button" data-action="new-portfolio" title="Create your first paper portfolio">+</button>
        <p class="eyebrow">Welcome</p>
        <h2>Create your first paper portfolio</h2>
        <p>Start with virtual cash, add starting holdings, and practice US stock trading safely.</p>
      </section>
    `;
    return;
  }
  view.innerHTML = `
    <div class="page-head">
      <div>
        <p class="eyebrow">Portfolios</p>
        <h2>Your paper accounts</h2>
        <span>Open a portfolio, create a new strategy, or mirror an outside account with starting holdings.</span>
      </div>
      <button class="primary-action" type="button" data-action="new-portfolio" title="Create stock, forex, or crypto paper portfolio">+ New Portfolio</button>
    </div>
    <section class="portfolio-grid">
      ${state.portfolios.map(portfolioCard).join("")}
      <button class="portfolio-card add-card" type="button" data-action="new-portfolio" title="Create another portfolio">
        <strong>+</strong>
        <span>New Portfolio</span>
      </button>
    </section>
  `;
}

function renderPortfolio() {
  const view = elements.views.portfolio;
  const portfolio = activePortfolio();
  if (!portfolio) {
    view.innerHTML = "";
    return;
  }
  const summary = portfolioSummary(portfolio);
  view.innerHTML = `
    <div class="page-head portfolio-context">
      <div>
        <button class="text-link" type="button" data-nav="portfolios">All portfolios</button>
        <p class="eyebrow">${assetLabel(portfolio.account_type)}</p>
        <h2>${escapeHtml(portfolio.name)}</h2>
      </div>
      <div class="portfolio-actions">
        <button type="button" data-action="export-portfolio" title="Download current holdings as an Excel file">Export Excel</button>
        <select id="portfolio-switcher" title="Switch active portfolio">
          ${state.portfolios.map((item) => `<option value="${item.id}" ${item.id === portfolio.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}
        </select>
      </div>
    </div>
    <section class="summary-strip">
      <article><span>Total value</span><strong>${money(summary.totalValue)}</strong></article>
      <article><span>Cash</span><strong>${money(summary.cash)}</strong></article>
      <article><span>Invested</span><strong>${money(summary.holdingsValue)}</strong></article>
      <article><span>Today P/L</span><strong class="${summary.todayPnl >= 0 ? "positive" : "negative"}">${signedMoney(summary.todayPnl)}</strong></article>
      <article><span>Total P/L</span><strong class="${summary.totalPnl >= 0 ? "positive" : "negative"}">${signedMoney(summary.totalPnl)}</strong></article>
    </section>
    <nav class="subnav">
      ${["overview", "holdings", "watchlist", "history"].map((tab) => `<button type="button" class="${state.portfolioTab === tab ? "active" : ""}" data-portfolio-tab="${tab}">${tab}</button>`).join("")}
    </nav>
    ${renderPortfolioTab(portfolio)}
  `;
}

function renderPortfolioTab(portfolio) {
  const searchPanel = renderSearchPanel();
  if (state.portfolioTab === "holdings") return `${searchPanel}${renderHoldingsTable(portfolioHoldings(portfolio.id))}`;
  if (state.portfolioTab === "watchlist") return `${searchPanel}${renderWatchlistTable(portfolioWatchlist(portfolio.id))}`;
  if (state.portfolioTab === "history") return renderTradeHistory(portfolioTrades(portfolio.id), true);
  return `
    ${searchPanel}
    <section class="two-column">
      <div>
        <div class="section-title"><h3>Holdings</h3></div>
        ${renderHoldingsTable(portfolioHoldings(portfolio.id), 8)}
        ${renderViewMore(portfolioHoldings(portfolio.id).length, "holdings")}
      </div>
      <div>
        <div class="section-title"><h3>Watchlist</h3></div>
        ${renderWatchlistTable(portfolioWatchlist(portfolio.id), 8)}
        ${renderViewMore(portfolioWatchlist(portfolio.id).length, "watchlist")}
      </div>
    </section>
  `;
}

function renderViewMore(total, tab) {
  if (total <= 8) return "";
  return `
    <div class="view-more-row">
      <button type="button" data-portfolio-tab="${tab}">View more</button>
    </div>
  `;
}

function renderSearchPanel() {
  const portfolio = activePortfolio();
  const isForex = portfolio?.account_type === "forex";
  const isCrypto = portfolio?.account_type === "crypto";
  const popular = isForex ? POPULAR_FOREX : isCrypto ? POPULAR_CRYPTO : POPULAR_STOCKS;
  const assetName = isForex ? "forex pair" : isCrypto ? "crypto pair" : "stock";
  return `
    <section class="search-panel">
      <div>
        <h3>Add ${assetName}</h3>
        <p>${isForex ? "Search a currency pair such as EUR/USD or GBP/USD." : isCrypto ? "Search Bitcoin, Ethereum, XRP, or a pair such as BTC/USD." : "Search by company name or symbol. Choose the result before adding or trading."}</p>
      </div>
      <form id="asset-search-form" class="search-form">
        <input id="asset-search-input" placeholder="${isForex ? "Search EUR/USD, GBP/USD..." : isCrypto ? "Search BTC/USD, ETH/USD, XRP/USD..." : "Search Apple, Tesla, NVDA..."}" autocomplete="off" />
        <button type="submit" title="Search ${assetName}">Search</button>
      </form>
      <div class="popular-row">
        <span>Popular to explore</span>
        ${popular.map((symbol) => `<button type="button" data-search-symbol="${symbol}" title="Search ${symbol}">${symbol}</button>`).join("")}
      </div>
      <div class="search-results">
        ${state.searchResults.map(renderSearchResult).join("")}
      </div>
    </section>
  `;
}

function renderSearchResult(asset) {
  const quote = quoteFor(asset.symbol);
  const chartOnly = assetTypeForPortfolio() === "forex" || assetTypeForPortfolio() === "crypto";
  return `
    <article class="search-result">
      <button type="button" class="result-main" data-action="open-stock" data-symbol="${asset.symbol}" title="Open ${asset.symbol}">
        <strong>${escapeHtml(asset.symbol)}</strong>
        <span>${escapeHtml(asset.name || "")}</span>
        <small>${escapeHtml(asset.exchange || "")}</small>
      </button>
      <div>
        <strong>${money(quote?.regularMarketPrice)}</strong>
        <span class="${Number(quote?.regularMarketChangePercent) >= 0 ? "positive" : "negative"}">${signedPercent(quote?.regularMarketChangePercent)}</span>
      </div>
      <button type="button" data-action="watch-asset" data-symbol="${asset.symbol}" title="Add ${asset.symbol} to watchlist">Watch</button>
      ${chartOnly ? `<button type="button" data-action="open-stock" data-symbol="${asset.symbol}" title="Open ${asset.symbol} chart">Chart</button>` : `<button type="button" data-action="trade-asset" data-symbol="${asset.symbol}" title="Buy ${asset.symbol} with paper cash">Buy</button>`}
    </article>
  `;
}

function sortLabel(scope, column, label) {
  const sortKey = `${scope}Sort`;
  const directionKey = `${scope}Direction`;
  const active = state[sortKey] === column;
  const arrow = active ? (state[directionKey] === "asc" ? " up" : " down") : "";
  return `<button type="button" class="${active ? "active" : ""}" data-list-sort="${scope}" data-column="${column}" title="Sort by ${label}">${label}${arrow}</button>`;
}

function sortRows(rows, scope, getValue) {
  const sortKey = `${scope}Sort`;
  const directionKey = `${scope}Direction`;
  const direction = state[directionKey] === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const av = getValue(a, state[sortKey]);
    const bv = getValue(b, state[sortKey]);
    if (typeof av === "string" || typeof bv === "string") {
      return String(av || "").localeCompare(String(bv || "")) * direction;
    }
    return ((Number(av) || 0) - (Number(bv) || 0)) * direction;
  });
  return rows;
}

function renderHoldingsTable(holdings, limit = Infinity) {
  if (!holdings.length) {
    const type = assetTypeForPortfolio();
    return `<section class="empty-list"><h3>No holdings yet</h3><p>Search ${type === "forex" ? "a forex pair" : type === "crypto" ? "a crypto pair" : "a stock"} to add it, or add starting holdings to mirror another account.</p></section>`;
  }
  const type = assetTypeForPortfolio();
  const isForex = type === "forex";
  const isCrypto = type === "crypto";
  const rows = sortRows(
    holdings.map((holding) => {
      const stats = holdingStats(holding);
      return { holding, stats, companyName: holding.name || stats.quote?.shortName || "" };
    }),
    "holdings",
    (row, column) => {
      if (column === "price") return row.stats.price;
      if (column === "shares") return row.stats.quantity;
      if (column === "value") return row.stats.value;
      if (column === "dayPnl") return row.stats.dayPnl;
      if (column === "pnl") return row.stats.totalPnl;
      if (column === "pnlPercent") return row.stats.totalPnlPercent;
      return row.holding.symbol;
    }
  ).slice(0, limit);
  return `
    <div class="data-table holdings-table">
      <div class="table-row table-head">
        ${sortLabel("holdings", "symbol", isForex || isCrypto ? "Pair" : "Stock")}
        ${sortLabel("holdings", "price", "Price")}
        ${sortLabel("holdings", "shares", "Shares")}
        ${sortLabel("holdings", "value", "Value")}
        ${sortLabel("holdings", "dayPnl", "Today")}
        ${sortLabel("holdings", "pnl", "Total P/L")}
      </div>
      ${rows.map(({ holding, stats, companyName }) => {
        return `
          <button class="table-row interactive-row" type="button" data-action="open-stock" data-symbol="${holding.symbol}" title="Open ${holding.symbol} details">
            <span class="stock-identity"><strong>${holding.symbol}</strong><small>${escapeHtml(companyName)}</small></span>
            <span class="metric" data-label="Price">${money(stats.price)}</span>
            <span class="metric" data-label="Shares">${number(stats.quantity)}</span>
            <span class="metric" data-label="Value">${money(stats.value)}</span>
            <span class="metric ${stats.dayPnl >= 0 ? "positive" : "negative"}" data-label="Today">${signedMoney(stats.dayPnl)}</span>
            <span class="metric pnl-stack ${stats.totalPnl >= 0 ? "positive" : "negative"}" data-label="Total P/L"><strong>${signedMoney(stats.totalPnl)}</strong><small>${signedPercent(stats.totalPnlPercent)}</small></span>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function renderWatchlistTable(items, limit = Infinity) {
  if (!items.length) {
    const type = assetTypeForPortfolio();
    return `<section class="empty-list"><h3>No watchlist ${type === "us_stock" ? "stocks" : "pairs"}</h3><p>Use search to follow ${type === "forex" ? "currency pairs" : type === "crypto" ? "crypto pairs" : "stocks"} before trading them.</p></section>`;
  }
  const rows = sortRows(
    items.map((item) => {
      const quote = quoteFor(item.symbol);
      return { item, quote, companyName: item.name || quote?.shortName || "" };
    }),
    "watchlist",
    (row, column) => {
      if (column === "price") return Number(row.quote?.regularMarketPrice) || 0;
      if (column === "dayPercent") return Number(row.quote?.regularMarketChangePercent) || 0;
      return row.item.symbol;
    }
  ).slice(0, limit);
  const type = assetTypeForPortfolio();
  const chartOnly = type === "forex" || type === "crypto";
  return `
    <div class="data-table watchlist-table">
      <div class="table-row table-head">
        ${sortLabel("watchlist", "symbol", chartOnly ? "Pair" : "Stock")}
        ${sortLabel("watchlist", "price", "Price")}
        ${sortLabel("watchlist", "dayPercent", "Day")}
        <span></span><span></span>
      </div>
      ${rows.map(({ item, quote, companyName }) => {
        return `
          <div class="table-row">
            <button type="button" class="stock-cell interactive-cell" data-action="open-stock" data-symbol="${item.symbol}" title="Open ${item.symbol} details">
              <strong>${item.symbol}</strong><small>${escapeHtml(companyName)}</small>
            </button>
            <span class="metric" data-label="Price">${money(quote?.regularMarketPrice)}</span>
            <span class="metric ${Number(quote?.regularMarketChangePercent) >= 0 ? "positive" : "negative"}" data-label="Day">${signedPercent(quote?.regularMarketChangePercent)}</span>
            ${chartOnly ? `<button type="button" data-action="open-stock" data-symbol="${item.symbol}" title="Open ${item.symbol} chart">Chart</button>` : `<button type="button" data-action="trade-asset" data-symbol="${item.symbol}" title="Buy ${item.symbol}">Buy</button>`}
            <button type="button" data-action="remove-watch" data-symbol="${item.symbol}" title="Remove ${item.symbol}">Remove</button>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderStock() {
  const view = elements.views.stock;
  const portfolio = activePortfolio();
  const symbol = state.selectedSymbol;
  if (!portfolio || !symbol) {
    view.innerHTML = "";
    return;
  }
  const quote = quoteFor(symbol);
  const holding = portfolioHoldings().find((item) => item.symbol === symbol);
  const stats = holding ? holdingStats(holding) : null;
  view.innerHTML = `
    <div class="page-head">
      <div>
        <button class="text-link" type="button" data-action="back-to-portfolio">Back to ${escapeHtml(portfolio.name)}</button>
        <p class="eyebrow">${escapeHtml(quote?.shortName || "Stock detail")}</p>
        <h2>${symbol}</h2>
      </div>
      <div class="stock-price">
        <strong>${money(quote?.regularMarketPrice)}</strong>
        <span class="${Number(quote?.regularMarketChangePercent) >= 0 ? "positive" : "negative"}">${signedPercent(quote?.regularMarketChangePercent)}</span>
      </div>
    </div>
    <nav class="subnav">
      ${["chart", "trade", "news", "position"].map((tab) => `<button type="button" class="${state.stockTab === tab ? "active" : ""}" data-stock-tab="${tab}">${tab}</button>`).join("")}
    </nav>
    <section class="stock-detail-grid">
      <div class="stock-main">${renderStockTab(symbol, holding, stats)}</div>
      ${state.stockTab === "trade" ? "" : `<aside class="trade-panel">${renderTradePanel(symbol, holding, stats)}</aside>`}
    </section>
  `;
  if (state.stockTab === "chart") drawChart();
}

function renderStockTab(symbol, holding, stats) {
  if (state.stockTab === "trade") return renderTradePanel(symbol, holding, stats, true);
  if (state.stockTab === "news") {
    const articles = state.news?.symbol === symbol ? state.news.articles || [] : [];
    if (!articles.length) {
      loadNews(symbol).then(render).catch((error) => setStatus(error.message, "warning"));
      return `<section class="empty-list"><h3>Loading news...</h3></section>`;
    }
    return `<section class="news-list">${articles.map((article) => `
      <a href="${article.link}" target="_blank" rel="noreferrer">
        <strong>${escapeHtml(article.title)}</strong>
        <span>${escapeHtml(article.publisher || "")} • ${new Date(article.publishedAt).toLocaleString()}</span>
        <p>${escapeHtml(article.summary || "")}</p>
      </a>
    `).join("")}</section>`;
  }
  if (state.stockTab === "position") {
    return `
      <section class="position-card">
        <h3>Position</h3>
        ${holding ? `
          <dl>
            <div><dt>Shares</dt><dd>${number(stats.quantity)}</dd></div>
            <div><dt>Average cost</dt><dd>${money(stats.avgCost)}</dd></div>
            <div><dt>Market value</dt><dd>${money(stats.value)}</dd></div>
            <div><dt>Today P/L</dt><dd class="${stats.dayPnl >= 0 ? "positive" : "negative"}">${signedMoney(stats.dayPnl)}</dd></div>
            <div><dt>Total P/L</dt><dd class="${stats.totalPnl >= 0 ? "positive" : "negative"}">${signedMoney(stats.totalPnl)} (${signedPercent(stats.totalPnlPercent)})</dd></div>
          </dl>
        ` : `<p>You do not own ${symbol} in this portfolio.</p>`}
      </section>
    `;
  }
  return `
    <section class="chart-card">
      <div class="chart-head">
        <h3>Price chart</h3>
        <div class="periods">${Object.entries(PERIODS).map(([period, label]) => `<button type="button" class="${state.chartPeriod === period ? "active" : ""}" data-period="${period}">${label}</button>`).join("")}</div>
      </div>
      <canvas id="stock-chart" width="1000" height="420"></canvas>
    </section>
  `;
}

function renderTradePanel(symbol, holding, stats, full = false) {
  const summary = portfolioSummary();
  const portfolio = activePortfolio();
  if (portfolio?.account_type === "forex" || portfolio?.account_type === "crypto") {
    const label = portfolio.account_type === "forex" ? "Forex" : "Crypto";
    return `
      <section class="trade-ticket ${full ? "full" : ""}">
        <h3>${label} paper trading</h3>
        <p>Quotes and charts are connected through Twelve Data. ${portfolio.account_type === "forex" ? "Lot size, pips, leverage, and margin simulation" : "Coin units, fees, and exchange-style order simulation"} will be added next.</p>
        <button type="button" data-stock-tab="chart">View chart</button>
      </section>
    `;
  }
  return `
    <section class="trade-ticket ${full ? "full" : ""}">
      <h3>Paper trade</h3>
      <p>Cash available: <strong>${money(summary.cash)}</strong></p>
      ${holding ? `<p>Owned: <strong>${number(stats.quantity)} shares</strong> at ${money(stats.avgCost)}</p>` : `<p>No current position.</p>`}
      <form class="trade-form" data-symbol="${symbol}">
        <div class="segmented">
          <button type="button" class="active" data-side="buy">Buy</button>
          <button type="button" data-side="sell">Sell</button>
        </div>
        <label>
          <span>Quantity</span>
          <input name="quantity" type="number" min="0" step="0.0001" inputmode="decimal" required />
        </label>
        <button class="primary-action" type="submit">Place paper order</button>
      </form>
      <details>
        <summary>Add starting holding</summary>
        <form class="starting-form" data-symbol="${symbol}">
          <label><span>Quantity</span><input name="quantity" type="number" min="0" step="0.0001" required /></label>
          <label><span>Average cost</span><input name="avgCost" type="number" min="0" step="0.01" required /></label>
          <button type="submit">Save starting holding</button>
        </form>
      </details>
    </section>
  `;
}

function formatChartTime(timestamp) {
  const date = new Date(Number(timestamp) * 1000);
  const options =
    state.chartPeriod === "1d" || state.chartPeriod === "5d"
      ? { hour: "numeric", minute: "2-digit" }
      : { month: "short", day: "numeric" };
  return date.toLocaleString(undefined, options);
}

function drawChart(hoverIndex = null) {
  const canvas = document.querySelector("#stock-chart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(600, rect.width * dpr);
  canvas.height = 420 * dpr;
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#101418";
  ctx.fillRect(0, 0, width, height);
  const points = state.chartPoints.filter((point) => Number.isFinite(Number(point.close || point.price)));
  canvas.onmousemove = null;
  canvas.onmouseleave = null;
  if (points.length < 2) {
    ctx.fillStyle = "#9aa8af";
    ctx.font = `${16 * dpr}px system-ui`;
    ctx.fillText("No chart data", 24 * dpr, 44 * dpr);
    return;
  }
  const prices = points.map((point) => Number(point.close || point.price));
  const rawMin = Math.min(...prices);
  const rawMax = Math.max(...prices);
  const priceRange = Math.max(0.01, rawMax - rawMin);
  const min = rawMin - priceRange * 0.08;
  const max = rawMax + priceRange * 0.08;
  const margin = {
    top: 34 * dpr,
    right: 76 * dpr,
    bottom: 48 * dpr,
    left: 18 * dpr
  };
  const plotLeft = margin.left;
  const plotRight = width - margin.right;
  const plotTop = margin.top;
  const plotBottom = height - margin.bottom;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;
  const xFor = (index) => plotLeft + (index / (points.length - 1)) * plotWidth;
  const yFor = (price) => plotBottom - ((price - min) / Math.max(0.01, max - min)) * plotHeight;
  const start = prices[0];
  const latest = prices[prices.length - 1];
  const isUp = latest >= start;
  const lineColor = isUp ? "#58d68d" : "#ff6b6b";
  const gridColor = "rgba(238, 243, 245, 0.085)";
  const labelColor = "#9aa8af";

  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1 * dpr;
  ctx.fillStyle = labelColor;
  ctx.font = `${11 * dpr}px system-ui`;
  ctx.textBaseline = "middle";
  ctx.fillText("Price", plotRight + 10 * dpr, plotTop - 14 * dpr);
  for (let step = 0; step <= 4; step += 1) {
    const ratio = step / 4;
    const y = plotTop + ratio * plotHeight;
    const price = max - ratio * (max - min);
    ctx.beginPath();
    ctx.moveTo(plotLeft, y);
    ctx.lineTo(plotRight, y);
    ctx.stroke();
    ctx.fillText(money(price), plotRight + 10 * dpr, y);
  }

  ctx.textBaseline = "top";
  const xTicks = 4;
  for (let step = 0; step <= xTicks; step += 1) {
    const index = Math.min(points.length - 1, Math.round((step / xTicks) * (points.length - 1)));
    const x = xFor(index);
    ctx.beginPath();
    ctx.moveTo(x, plotTop);
    ctx.lineTo(x, plotBottom);
    ctx.stroke();
    const label = formatChartTime(points[index].time);
    const textWidth = ctx.measureText(label).width;
    ctx.fillText(label, Math.min(Math.max(plotLeft, x - textWidth / 2), plotRight - textWidth), plotBottom + 14 * dpr);
  }
  ctx.fillText("Time", plotRight - 24 * dpr, plotBottom + 32 * dpr);

  const gradient = ctx.createLinearGradient(0, plotTop, 0, plotBottom);
  gradient.addColorStop(0, isUp ? "rgba(88, 214, 141, 0.28)" : "rgba(255, 107, 107, 0.28)");
  gradient.addColorStop(1, "rgba(98, 200, 221, 0)");
  ctx.beginPath();
  prices.forEach((price, index) => {
    const x = xFor(index);
    const y = yFor(price);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(plotRight, plotBottom);
  ctx.lineTo(plotLeft, plotBottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.strokeStyle = "#62c8dd";
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2.4 * dpr;
  ctx.beginPath();
  prices.forEach((price, index) => {
    const x = xFor(index);
    const y = yFor(price);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  const latestY = yFor(latest);
  ctx.strokeStyle = lineColor;
  ctx.setLineDash([4 * dpr, 4 * dpr]);
  ctx.beginPath();
  ctx.moveTo(plotLeft, latestY);
  ctx.lineTo(plotRight, latestY);
  ctx.stroke();
  ctx.setLineDash([]);
  const priceTag = money(latest);
  const tagWidth = ctx.measureText(priceTag).width + 14 * dpr;
  ctx.fillStyle = lineColor;
  ctx.fillRect(plotRight + 7 * dpr, latestY - 12 * dpr, tagWidth, 24 * dpr);
  ctx.fillStyle = "#101418";
  ctx.font = `${11 * dpr}px system-ui`;
  ctx.fillText(priceTag, plotRight + 14 * dpr, latestY + 1 * dpr);

  ctx.fillStyle = "#eef3f5";
  ctx.font = `${13 * dpr}px system-ui`;
  ctx.textBaseline = "alphabetic";
  const change = latest - start;
  const changePercent = start ? (change / start) * 100 : 0;
  ctx.fillText(`Start ${money(start)}   High ${money(rawMax)}   Low ${money(rawMin)}   Change ${signedMoney(change)} (${signedPercent(changePercent)})`, plotLeft, 22 * dpr);

  const activeIndex = Number.isInteger(hoverIndex) ? Math.min(points.length - 1, Math.max(0, hoverIndex)) : null;
  if (activeIndex !== null) {
    const point = points[activeIndex];
    const price = prices[activeIndex];
    const x = xFor(activeIndex);
    const y = yFor(price);
    ctx.strokeStyle = "rgba(238, 243, 245, 0.42)";
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(x, plotTop);
    ctx.lineTo(x, plotBottom);
    ctx.moveTo(plotLeft, y);
    ctx.lineTo(plotRight, y);
    ctx.stroke();
    ctx.fillStyle = lineColor;
    ctx.beginPath();
    ctx.arc(x, y, 4.5 * dpr, 0, Math.PI * 2);
    ctx.fill();

    const tooltipLines = [formatChartTime(point.time), money(price)];
    ctx.font = `${12 * dpr}px system-ui`;
    const tooltipWidth = Math.max(...tooltipLines.map((line) => ctx.measureText(line).width)) + 18 * dpr;
    const tooltipHeight = 48 * dpr;
    const tooltipX = x + tooltipWidth + 14 * dpr > plotRight ? x - tooltipWidth - 12 * dpr : x + 12 * dpr;
    const tooltipY = Math.max(plotTop + 4 * dpr, Math.min(plotBottom - tooltipHeight, y - tooltipHeight / 2));
    ctx.fillStyle = "rgba(15, 18, 20, 0.94)";
    ctx.fillRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
    ctx.strokeStyle = "rgba(238, 243, 245, 0.16)";
    ctx.strokeRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
    ctx.fillStyle = "#9aa8af";
    ctx.fillText(tooltipLines[0], tooltipX + 9 * dpr, tooltipY + 18 * dpr);
    ctx.fillStyle = "#eef3f5";
    ctx.fillText(tooltipLines[1], tooltipX + 9 * dpr, tooltipY + 36 * dpr);
  }

  canvas.onmousemove = (event) => {
    const box = canvas.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - box.left - margin.left / dpr) / (plotWidth / dpr)));
    drawChart(Math.round(ratio * (points.length - 1)));
  };
  canvas.onmouseleave = () => drawChart();
}

function renderCompare() {
  const view = elements.views.compare;
  const portfolio = activePortfolio();
  if (!portfolio) {
    view.innerHTML = `<section class="empty-state compact"><h2>Create a portfolio first</h2></section>`;
    return;
  }
  const rows = allSymbols(portfolio.id).map((symbol) => {
    const holding = portfolioHoldings(portfolio.id).find((item) => item.symbol === symbol);
    const quote = quoteFor(symbol);
    const performance = state.performance.get(symbol);
    const stats = holding ? holdingStats(holding) : null;
    return { symbol, quote, performance, stats, holding };
  });
  rows.sort((a, b) => {
    const direction = state.compareDirection === "asc" ? 1 : -1;
    const get = (row) => {
      if (state.compareSort === "performance") return Number(row.performance?.changePercent) || 0;
      if (state.compareSort === "price") return Number(row.quote?.regularMarketPrice) || 0;
      if (state.compareSort === "shares") return Number(row.stats?.quantity) || 0;
      if (state.compareSort === "value") return Number(row.stats?.value) || 0;
      if (state.compareSort === "dayPercent") return Number(row.quote?.regularMarketChangePercent) || 0;
      if (state.compareSort === "dayPnl") return Number(row.stats?.dayPnl) || 0;
      if (state.compareSort === "pnl") return Number(row.stats?.totalPnl) || 0;
      if (state.compareSort === "pnlPercent") return Number(row.stats?.totalPnlPercent) || 0;
      return row.symbol;
    };
    const av = get(a);
    const bv = get(b);
    return typeof av === "string" ? av.localeCompare(bv) * direction : (av - bv) * direction;
  });
  const sortLabel = (column, label) => {
    const active = state.compareSort === column;
    const arrow = active ? (state.compareDirection === "asc" ? " up" : " down") : "";
    return `<button type="button" class="${active ? "active" : ""}" data-sort="${column}" title="Sort by ${label}">${label}${arrow}</button>`;
  };
  view.innerHTML = `
    <div class="page-head">
      <div><p class="eyebrow">Compare</p><h2>${escapeHtml(portfolio.name)}</h2><span>Holdings and watchlist performance for the active portfolio.</span></div>
      <form class="compare-controls" id="compare-period-form">
        <label>
          <span>Period</span>
          <input name="amount" type="number" min="1" max="365" value="${escapeHtml(state.compareAmount)}" />
        </label>
        <label>
          <span>Unit</span>
          <select name="unit">
            <option value="hours" ${state.compareUnit === "hours" ? "selected" : ""}>Hours</option>
            <option value="days" ${state.compareUnit === "days" ? "selected" : ""}>Days</option>
            <option value="months" ${state.compareUnit === "months" ? "selected" : ""}>Months</option>
          </select>
        </label>
        <button type="submit">Update</button>
      </form>
    </div>
    <div class="data-table compare-table">
      <div class="table-row table-head">
        ${sortLabel("symbol", "Symbol")}
        ${sortLabel("price", "Price")}
        ${sortLabel("shares", "Shares")}
        ${sortLabel("performance", state.comparePeriodLabel)}
        ${sortLabel("value", "Value")}
        ${sortLabel("dayPercent", "Day %")}
        ${sortLabel("dayPnl", "Day P/L")}
        ${sortLabel("pnl", "Total P/L")}
        ${sortLabel("pnlPercent", "P/L %")}
      </div>
      ${rows.map((row) => `
        <button class="table-row" type="button" data-action="open-stock" data-symbol="${row.symbol}">
          <span class="stock-identity"><strong>${row.symbol}</strong><small>${escapeHtml(row.holding?.name || row.quote?.shortName || "")}</small></span>
          <span>${money(row.quote?.regularMarketPrice)}</span>
          <span>${row.stats ? number(row.stats.quantity) : "--"}</span>
          <span class="${Number(row.performance?.changePercent) >= 0 ? "positive" : "negative"}">${signedPercent(row.performance?.changePercent)} ${row.performance?.effectiveLabel ? `<small>(${escapeHtml(row.performance.effectiveLabel)})</small>` : ""}</span>
          <span>${row.stats ? money(row.stats.value) : "--"}</span>
          <span class="${Number(row.quote?.regularMarketChangePercent) >= 0 ? "positive" : "negative"}">${signedPercent(row.quote?.regularMarketChangePercent)}</span>
          <span class="${Number(row.stats?.dayPnl) >= 0 ? "positive" : "negative"}">${row.stats ? signedMoney(row.stats.dayPnl) : "--"}</span>
          <span class="${Number(row.stats?.totalPnl) >= 0 ? "positive" : "negative"}">${row.stats ? signedMoney(row.stats.totalPnl) : "--"}</span>
          <span class="${Number(row.stats?.totalPnlPercent) >= 0 ? "positive" : "negative"}">${row.stats ? signedPercent(row.stats.totalPnlPercent) : "--"}</span>
        </button>
      `).join("") || `<section class="empty-list"><h3>No symbols to compare</h3></section>`}
    </div>
  `;
}

function renderHistory() {
  const view = elements.views.history;
  const trades = state.portfolios.flatMap((portfolio) =>
    portfolioTrades(portfolio.id).map((trade) => ({ ...trade, portfolioName: portfolio.name }))
  );
  view.innerHTML = `
    <div class="page-head">
      <div><p class="eyebrow">History</p><h2>All paper trades</h2><span>Every buy, sell, and starting position across portfolios.</span></div>
    </div>
    ${renderTradeHistory(trades, false)}
  `;
}

function renderTradeHistory(trades, compact) {
  if (!trades.length) return `<section class="empty-list"><h3>No trades yet</h3><p>Trades will appear here after buying, selling, or adding starting holdings.</p></section>`;
  return `
    <div class="history-list ${compact ? "compact" : ""}">
      ${trades.map((trade) => `
        <article class="trade-row ${trade.trade_type}">
          <div><strong>${escapeHtml(trade.symbol)}</strong><span>${escapeHtml(trade.portfolioName || "")}</span></div>
          <span>${escapeHtml(trade.trade_type.replace("_", " "))}</span>
          <span>${number(trade.quantity)} @ ${money(trade.price)}</span>
          <span>${money(trade.total)}</span>
          <time>${new Date(trade.created_at).toLocaleString()}</time>
        </article>
      `).join("")}
    </div>
  `;
}

function renderAi() {
  const view = elements.views.ai;
  view.innerHTML = `
    <div class="page-head">
      <div><p class="eyebrow">AI Trading</p><h2>Claude paper controls</h2><span>Create keys in Settings, then choose which portfolios Claude can trade.</span></div>
      <button type="button" data-action="load-api-keys">Refresh keys</button>
    </div>
    <section class="ai-grid">
      ${state.portfolios.map((portfolio) => {
        const setting = state.aiSettings.get(portfolio.id) || {};
        return `
          <article class="ai-card">
            <div><h3>${escapeHtml(portfolio.name)}</h3><span>${assetLabel(portfolio.account_type)}</span></div>
            <label class="switch"><input type="checkbox" data-ai-field="enabled" data-id="${portfolio.id}" ${setting.enabled ? "checked" : ""} /><span>Allow Claude trades</span></label>
            <label class="switch"><input type="checkbox" data-ai-field="allow_buy" data-id="${portfolio.id}" ${setting.allow_buy !== false ? "checked" : ""} /><span>Buy allowed</span></label>
            <label class="switch"><input type="checkbox" data-ai-field="allow_sell" data-id="${portfolio.id}" ${setting.allow_sell !== false ? "checked" : ""} /><span>Sell allowed</span></label>
            <label><span>Max trade size %</span><input data-ai-field="max_trade_percent" data-id="${portfolio.id}" type="number" min="1" max="100" value="${Number(setting.max_trade_percent) || 10}" /></label>
            <label><span>Max daily trades</span><input data-ai-field="max_daily_trades" data-id="${portfolio.id}" type="number" min="1" max="50" value="${Number(setting.max_daily_trades) || 5}" /></label>
          </article>
        `;
      }).join("") || `<section class="empty-list"><h3>Create a portfolio first</h3></section>`}
    </section>
  `;
}

function renderSettings() {
  const view = elements.views.settings;
  view.innerHTML = `
    <div class="page-head">
      <div><p class="eyebrow">Settings</p><h2>Account and API keys</h2><span>Technical setup lives here, away from the trading workflow.</span></div>
    </div>
    <section class="settings-grid">
      <article class="settings-card"><span>User</span><strong>${escapeHtml(state.session?.user?.email || "")}</strong></article>
      <article class="settings-card"><span>Supabase</span><strong>${state.supabase ? "Connected" : "Missing"}</strong></article>
      <article class="settings-card"><span>Claude API</span><strong>${state.config?.paperApiKeysEnabled ? "Available" : "Service key missing"}</strong></article>
    </section>
    <section class="api-panel">
      <div><h3>Claude API keys</h3><p>Keys allow paper-only actions. Portfolio permissions are controlled on the AI Trading page.</p></div>
      <button type="button" data-action="create-api-key">Create API key</button>
      <pre id="new-api-secret" hidden></pre>
      <div class="api-list">
        ${state.apiKeys.map((key) => `
          <article>
            <strong>${escapeHtml(key.name || "Claude key")}</strong>
            <span>${escapeHtml(key.key_prefix)} • ${escapeHtml(key.status)}</span>
            <button type="button" data-action="revoke-api-key" data-id="${key.id}">Revoke</button>
          </article>
        `).join("") || `<p>No API keys yet.</p>`}
      </div>
    </section>
  `;
}

function exportPortfolio() {
  const portfolio = activePortfolio();
  if (!portfolio) return;
  const headers = ["Symbol", "Name", "Quantity", "Average Cost", "Current Price", "Market Value", "Total P/L", "Total P/L %"];
  const rows = portfolioHoldings(portfolio.id).map((holding) => {
    const stats = holdingStats(holding);
    return [holding.symbol, holding.name || "", stats.quantity, stats.avgCost, stats.price || "", stats.value, stats.totalPnl, stats.totalPnlPercent];
  });
  const xmlRows = [headers, ...rows]
    .map((row) => `<Row>${row.map((cell) => `<Cell><Data ss:Type="${Number.isFinite(Number(cell)) && cell !== "" ? "Number" : "String"}">${escapeHtml(cell)}</Data></Cell>`).join("")}</Row>`)
    .join("");
  const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Portfolio"><Table>${xmlRows}</Table></Worksheet></Workbook>`;
  const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `poshkan-${portfolio.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xls`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function handleAuth(event) {
  event.preventDefault();
  const email = elements.authEmail.value.trim();
  const password = elements.authPassword.value;
  const username = elements.authUsername.value.trim();
  elements.authSubmit.disabled = true;
  try {
    const result =
      state.authMode === "signup"
        ? await state.supabase.auth.signUp({ email, password, options: { data: { display_name: username } } })
        : await state.supabase.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    elements.authMessage.textContent = state.authMode === "signup" ? "Account created. Check your email if confirmation is required." : "";
  } catch (error) {
    elements.authMessage.textContent = error.message;
  } finally {
    elements.authSubmit.disabled = false;
  }
}

async function signOut() {
  const client = state.supabase;
  state.session = null;
  state.user = null;
  state.portfolios = [];
  render();
  await client.auth.signOut({ scope: "local" });
  await client.auth.signOut();
}

async function boot() {
  try {
    await loadConfig();
    const { data } = await state.supabase.auth.getSession();
    state.session = data.session;
    if (state.session) {
      await loadCloudData();
      keepOrSetSignedInPage({ force: true });
    }
    state.supabase.auth.onAuthStateChange(async (_event, session) => {
      const wasSignedIn = Boolean(state.session);
      state.session = session;
      if (session) {
        await loadCloudData();
        keepOrSetSignedInPage({ force: !wasSignedIn });
      } else {
        state.page = "portfolios";
      }
      render();
    });
    render();
  } catch (error) {
    elements.authMessage.textContent = error.message;
  }
}

elements.authModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.authMode = button.dataset.authMode;
    elements.authModeButtons.forEach((item) => item.classList.toggle("active", item === button));
    elements.signupFields.hidden = state.authMode !== "signup";
    elements.authTitle.textContent = state.authMode === "signup" ? "Create account" : "Sign in";
    elements.authSubmit.textContent = state.authMode === "signup" ? "Create account" : "Sign in";
  });
});

elements.authForm.addEventListener("submit", handleAuth);
elements.signOut.addEventListener("click", signOut);
elements.settingsButton.addEventListener("click", async () => {
  state.page = "settings";
  await loadApiKeys();
  render();
});

document.addEventListener("click", async (event) => {
  const nav = event.target.closest("[data-nav]");
  if (nav) {
    const target = nav.dataset.nav;
    if (target === "portfolios") state.page = "portfolios";
    else state.page = target;
    if (target === "compare") await loadPerformance().catch((error) => setStatus(error.message, "warning"));
    if (target === "ai" || target === "settings") await loadApiKeys();
    render();
    return;
  }

  const action = event.target.closest("[data-action]");
  if (!action) return;
  const act = action.dataset.action;
  try {
    if (act === "new-portfolio") {
      setPortfolioMessage("");
      elements.dialog.showModal();
    }
    if (act === "open-portfolio") selectPortfolio(action.dataset.id);
    if (act === "archive-portfolio") await archivePortfolio(action.dataset.id);
    if (act === "open-stock") await loadStockDetail(action.dataset.symbol);
    if (act === "watch-asset") {
      const asset = state.searchResults.find((item) => item.symbol === action.dataset.symbol) || { symbol: action.dataset.symbol };
      await addToWatchlist(asset);
    }
    if (act === "trade-asset") {
      state.selectedSymbol = action.dataset.symbol;
      state.page = "stock";
      state.stockTab = "trade";
      await loadQuotes([state.selectedSymbol], assetTypeForPortfolio());
      render();
    }
    if (act === "remove-watch") await deleteWatchlistSymbol(action.dataset.symbol);
    if (act === "back-to-portfolio") {
      state.page = "portfolio";
      render();
    }
    if (act === "refresh-performance") {
      await loadPerformance();
      render();
    }
    if (act === "load-api-keys") {
      await loadApiKeys();
      render();
    }
    if (act === "create-api-key") await createApiKey();
    if (act === "revoke-api-key") await revokeApiKey(action.dataset.id);
    if (act === "export-portfolio") exportPortfolio();
  } catch (error) {
    setStatus(error.message, "warning");
  }
});

document.addEventListener("submit", async (event) => {
  const searchForm = event.target.closest("#asset-search-form");
  const tradeForm = event.target.closest(".trade-form");
  const startingForm = event.target.closest(".starting-form");
  const compareForm = event.target.closest("#compare-period-form");
  if (!searchForm && !tradeForm && !startingForm && !compareForm) return;
  event.preventDefault();
  try {
    if (searchForm) {
      await searchAssets(searchForm.querySelector("input").value);
    }
    if (compareForm) {
      state.compareAmount = Math.max(1, Number.parseInt(compareForm.elements.amount.value, 10) || 1);
      state.compareUnit = compareForm.elements.unit.value;
      await loadPerformance();
      render();
    }
    if (tradeForm) {
      const side = tradeForm.querySelector("[data-side].active")?.dataset.side || "buy";
      await executeTrade(tradeForm.dataset.symbol, side, tradeForm.elements.quantity.value);
    }
    if (startingForm) {
      await setStartingHolding(startingForm.dataset.symbol, startingForm.elements.quantity.value, startingForm.elements.avgCost.value);
    }
  } catch (error) {
    setStatus(error.message, "warning");
  }
});

document.addEventListener("click", (event) => {
  const listSortButton = event.target.closest("[data-list-sort]");
  if (listSortButton) {
    const scope = listSortButton.dataset.listSort;
    const column = listSortButton.dataset.column;
    const sortKey = `${scope}Sort`;
    const directionKey = `${scope}Direction`;
    if (!Object.hasOwn(state, sortKey) || !Object.hasOwn(state, directionKey)) return;
    if (state[sortKey] === column) {
      state[directionKey] = state[directionKey] === "asc" ? "desc" : "asc";
    } else {
      state[sortKey] = column;
      state[directionKey] = column === "symbol" ? "asc" : "desc";
    }
    render();
    return;
  }

  const sortButton = event.target.closest("[data-sort]");
  if (sortButton) {
    const column = sortButton.dataset.sort;
    if (state.compareSort === column) {
      state.compareDirection = state.compareDirection === "asc" ? "desc" : "asc";
    } else {
      state.compareSort = column;
      state.compareDirection = column === "symbol" ? "asc" : "desc";
    }
    render();
    return;
  }

  const side = event.target.closest("[data-side]");
  if (side) {
    const form = side.closest(".trade-form");
    form.querySelectorAll("[data-side]").forEach((button) => button.classList.toggle("active", button === side));
  }
  const tab = event.target.closest("[data-portfolio-tab]");
  if (tab) {
    state.portfolioTab = tab.dataset.portfolioTab;
    render();
  }
  const stockTab = event.target.closest("[data-stock-tab]");
  if (stockTab) {
    state.stockTab = stockTab.dataset.stockTab;
    if (state.stockTab === "chart") loadChart().then(render);
    else render();
  }
  const period = event.target.closest("[data-period]");
  if (period) {
    state.chartPeriod = period.dataset.period;
    loadChart().then(render).catch((error) => setStatus(error.message, "warning"));
  }
  const popular = event.target.closest("[data-search-symbol]");
  if (popular) {
    searchAssets(popular.dataset.searchSymbol).catch((error) => setStatus(error.message, "warning"));
  }
});

document.addEventListener("change", async (event) => {
  if (event.target.id === "portfolio-switcher") {
    selectPortfolio(event.target.value);
  }
  const aiField = event.target.dataset.aiField;
  if (aiField) {
    const value = event.target.type === "checkbox" ? event.target.checked : Number(event.target.value);
    await updateAiSetting(event.target.dataset.id, { [aiField]: value }).catch((error) => setStatus(error.message, "warning"));
  }
});

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-dialog]")) elements.dialog.close();
});

elements.portfolioForm.addEventListener("submit", (event) => {
  createPortfolio(event).catch((error) => {
    setStatus(error.message, "warning");
    setPortfolioMessage(error.message, "warning");
    const submit = elements.portfolioForm.querySelector('button[type="submit"]');
    if (submit) submit.disabled = false;
  });
});

boot();
