const STARTING_CASH = 100000;
const POPULAR_STOCKS = ["AAPL", "NVDA", "MSFT", "TSLA", "AMZN", "GOOGL", "META", "AMD"];
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
  compareSort: "symbol",
  compareDirection: "asc",
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
  portfolioStartingHoldings: document.querySelector("#portfolio-starting-holdings")
};

const moneyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });

function cleanSymbol(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9.^-]/g, "")
    .slice(0, 12);
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
  const text = String(message || "");
  const friendly =
    text.includes("row-level security") || text.includes("violates row-level security")
      ? "Database permissions need updating. Run supabase-portfolio-redesign.sql in Supabase, then try again."
      : text;
  elements.status.textContent = friendly;
  elements.status.className = `app-status ${type}`.trim();
}

function activePortfolio() {
  return state.portfolios.find((portfolio) => portfolio.id === state.selectedPortfolioId) || state.portfolios[0] || null;
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

async function loadQuotes(symbols = allSymbols()) {
  const clean = [...new Set(symbols.map(cleanSymbol).filter(Boolean))];
  if (!clean.length) return;
  const data = await fetchJson(`/api/quotes?symbols=${encodeURIComponent(clean.join(","))}`);
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
  const data = await fetchJson(`/api/search?q=${encodeURIComponent(q)}`);
  state.searchResults = data.suggestions || [];
  await loadQuotes(state.searchResults.map((item) => item.symbol));
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
  await loadQuotes(state.portfolios.flatMap((portfolio) => allSymbols(portfolio.id)));
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
  const userId = state.session.user.id;
  const name = elements.portfolioName.value.trim();
  const accountType = elements.portfolioType.value;
  const cash = Math.max(0, Number(elements.portfolioCash.value) || STARTING_CASH);
  if (!name) return;
  if (accountType === "crypto") {
    setStatus("Crypto portfolios are planned for the next phase.", "warning");
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
    const symbols = starting.map((item) => item.symbol);
    await loadQuotes(symbols);
    const holdings = starting.map((item) => ({
      portfolio_id: portfolio.id,
      user_id: userId,
      symbol: item.symbol,
      asset_type: "us_stock",
      name: quoteFor(item.symbol)?.shortName || item.symbol,
      quantity: item.quantity,
      avg_cost: item.avgCost
    }));
    const trades = starting.map((item) => ({
      portfolio_id: portfolio.id,
      user_id: userId,
      symbol: item.symbol,
      asset_type: "us_stock",
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
  const symbol = cleanSymbol(asset.symbol);
  if (portfolio.account_type !== "us_stock") return;
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
    asset_type: "us_stock",
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
  const clean = cleanSymbol(symbol);
  const qty = Math.max(0, Number(quantity) || 0);
  const cost = Math.max(0, Number(avgCost) || 0);
  if (!portfolio || !clean || qty <= 0) return;
  await loadQuotes([clean]);
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
  await state.supabase.from("portfolio_watchlist").delete().eq("portfolio_id", portfolio.id).eq("symbol", clean);
  await state.supabase.from("portfolio_trades").insert({
    portfolio_id: portfolio.id,
    user_id: userId,
    symbol: clean,
    asset_type: "us_stock",
    trade_type: "starting_position",
    quantity: qty,
    price: cost,
    total: qty * cost,
    source: "manual"
  });
  await loadCloudData();
  render();
  setStatus(`${clean} starting holding saved.`, "success");
}

async function executeTrade(symbol, side, quantity) {
  const portfolio = activePortfolio();
  const clean = cleanSymbol(symbol);
  const qty = Math.max(0, Number(quantity) || 0);
  if (!portfolio || !clean || !qty) {
    setStatus("Enter a symbol and quantity.", "warning");
    return;
  }
  await loadQuotes([clean]);
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
    await state.supabase.from("portfolio_watchlist").delete().eq("portfolio_id", portfolio.id).eq("symbol", clean);
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
      await state.supabase.from("portfolio_holdings").delete().eq("portfolio_id", portfolio.id).eq("symbol", clean);
    } else {
      await state.supabase
        .from("portfolio_holdings")
        .update({ quantity: Number(newQty.toFixed(6)), updated_at: new Date().toISOString() })
        .eq("portfolio_id", portfolio.id)
        .eq("symbol", clean);
    }
    cash += qty * price;
  }

  await state.supabase.from("portfolios").update({ cash: Number(cash.toFixed(2)), updated_at: new Date().toISOString() }).eq("id", portfolio.id);
  await state.supabase.from("portfolio_trades").insert({
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
  });
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
  await state.supabase.from("portfolio_watchlist").delete().eq("portfolio_id", portfolio.id).eq("symbol", cleanSymbol(symbol));
  await loadCloudData();
  render();
}

async function loadStockDetail(symbol) {
  const clean = cleanSymbol(symbol);
  state.selectedSymbol = clean;
  state.page = "stock";
  state.stockTab = "chart";
  await loadQuotes([clean]);
  await loadChart(clean);
  render();
}

async function loadChart(symbol = state.selectedSymbol) {
  if (!symbol) return;
  const data = await fetchJson(`/api/history?symbol=${encodeURIComponent(symbol)}&period=${encodeURIComponent(state.chartPeriod)}`);
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
  const data = await fetchJson(
    `/api/performance?symbols=${encodeURIComponent(symbols.join(","))}&amount=4&unit=days&heldSince=${encodeURIComponent(heldSince)}`
  );
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
        <span class="pill">${portfolio.account_type === "crypto" ? "Crypto" : "US Stocks"}</span>
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
      <button class="primary-action" type="button" data-action="new-portfolio" title="Create stock or crypto paper portfolio">+ New Portfolio</button>
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
        <p class="eyebrow">${portfolio.account_type === "crypto" ? "Crypto coming soon" : "US Stocks"}</p>
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
  if (portfolio.account_type === "crypto") {
    return `<section class="empty-state compact"><h3>Crypto portfolios are coming soon.</h3><p>The data model is ready, but trading will be added in a later phase.</p></section>`;
  }
  const searchPanel = renderSearchPanel();
  if (state.portfolioTab === "holdings") return `${searchPanel}${renderHoldingsTable(portfolioHoldings(portfolio.id))}`;
  if (state.portfolioTab === "watchlist") return `${searchPanel}${renderWatchlistTable(portfolioWatchlist(portfolio.id))}`;
  if (state.portfolioTab === "history") return renderTradeHistory(portfolioTrades(portfolio.id), true);
  return `
    ${searchPanel}
    <section class="two-column">
      <div>
        <div class="section-title"><h3>Holdings</h3><button type="button" data-portfolio-tab="holdings">View all</button></div>
        ${renderHoldingsTable(portfolioHoldings(portfolio.id).slice(0, 8))}
      </div>
      <div>
        <div class="section-title"><h3>Watchlist</h3><button type="button" data-portfolio-tab="watchlist">View all</button></div>
        ${renderWatchlistTable(portfolioWatchlist(portfolio.id).slice(0, 8))}
      </div>
    </section>
  `;
}

function renderSearchPanel() {
  return `
    <section class="search-panel">
      <div>
        <h3>Add stock</h3>
        <p>Search by company name or symbol. Choose the result before adding or trading.</p>
      </div>
      <form id="asset-search-form" class="search-form">
        <input id="asset-search-input" placeholder="Search Apple, Tesla, NVDA..." autocomplete="off" />
        <button type="submit" title="Search stock">Search</button>
      </form>
      <div class="popular-row">
        <span>Popular to explore</span>
        ${POPULAR_STOCKS.map((symbol) => `<button type="button" data-search-symbol="${symbol}" title="Search ${symbol}">${symbol}</button>`).join("")}
      </div>
      <div class="search-results">
        ${state.searchResults.map(renderSearchResult).join("")}
      </div>
    </section>
  `;
}

function renderSearchResult(asset) {
  const quote = quoteFor(asset.symbol);
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
      <button type="button" data-action="trade-asset" data-symbol="${asset.symbol}" title="Buy ${asset.symbol} with paper cash">Buy</button>
    </article>
  `;
}

function renderHoldingsTable(holdings) {
  if (!holdings.length) {
    return `<section class="empty-list"><h3>No holdings yet</h3><p>Search a stock to buy it, or add starting holdings to mirror another account.</p></section>`;
  }
  return `
    <div class="data-table holdings-table">
      <div class="table-row table-head">
        <span>Stock</span><span>Price</span><span>Shares</span><span>Value</span><span>Today</span><span>Total P/L</span><span></span>
      </div>
      ${holdings.map((holding) => {
        const stats = holdingStats(holding);
        return `
          <button class="table-row" type="button" data-action="open-stock" data-symbol="${holding.symbol}" title="Open ${holding.symbol}">
            <span><strong>${holding.symbol}</strong><small>${escapeHtml(holding.name || stats.quote?.shortName || "")}</small></span>
            <span>${money(stats.price)}</span>
            <span>${number(stats.quantity)}</span>
            <span>${money(stats.value)}</span>
            <span class="${stats.dayPnl >= 0 ? "positive" : "negative"}">${signedMoney(stats.dayPnl)}</span>
            <span class="${stats.totalPnl >= 0 ? "positive" : "negative"}">${signedMoney(stats.totalPnl)} <small>${signedPercent(stats.totalPnlPercent)}</small></span>
            <span class="row-chevron">View</span>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function renderWatchlistTable(items) {
  if (!items.length) {
    return `<section class="empty-list"><h3>No watchlist stocks</h3><p>Use search to follow stocks before buying them.</p></section>`;
  }
  return `
    <div class="data-table watchlist-table">
      <div class="table-row table-head">
        <span>Stock</span><span>Price</span><span>Day</span><span></span><span></span>
      </div>
      ${items.map((item) => {
        const quote = quoteFor(item.symbol);
        return `
          <div class="table-row">
            <button type="button" class="stock-cell" data-action="open-stock" data-symbol="${item.symbol}" title="Open ${item.symbol}">
              <strong>${item.symbol}</strong><small>${escapeHtml(item.name || quote?.shortName || "")}</small>
            </button>
            <span>${money(quote?.regularMarketPrice)}</span>
            <span class="${Number(quote?.regularMarketChangePercent) >= 0 ? "positive" : "negative"}">${signedPercent(quote?.regularMarketChangePercent)}</span>
            <button type="button" data-action="trade-asset" data-symbol="${item.symbol}" title="Buy ${item.symbol}">Buy</button>
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
      <aside class="trade-panel">${renderTradePanel(symbol, holding, stats)}</aside>
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

function drawChart() {
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
  if (points.length < 2) {
    ctx.fillStyle = "#9aa8af";
    ctx.font = `${16 * dpr}px system-ui`;
    ctx.fillText("No chart data", 24 * dpr, 44 * dpr);
    return;
  }
  const prices = points.map((point) => Number(point.close || point.price));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const pad = 28 * dpr;
  const xFor = (index) => pad + (index / (points.length - 1)) * (width - pad * 2);
  const yFor = (price) => height - pad - ((price - min) / Math.max(1, max - min)) * (height - pad * 2);
  ctx.strokeStyle = "#62c8dd";
  ctx.lineWidth = 2.4 * dpr;
  ctx.beginPath();
  prices.forEach((price, index) => {
    const x = xFor(index);
    const y = yFor(price);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.fillStyle = "#eef3f5";
  ctx.font = `${13 * dpr}px system-ui`;
  ctx.fillText(`High ${money(max)}  Low ${money(min)}`, pad, 22 * dpr);
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
    const get = (row) =>
      state.compareSort === "performance"
        ? Number(row.performance?.changePercent) || 0
        : state.compareSort === "value"
          ? Number(row.stats?.value) || 0
          : state.compareSort === "pnl"
            ? Number(row.stats?.totalPnl) || 0
            : state.compareSort === "price"
              ? Number(row.quote?.regularMarketPrice) || 0
              : row.symbol;
    const av = get(a);
    const bv = get(b);
    return typeof av === "string" ? av.localeCompare(bv) * direction : (av - bv) * direction;
  });
  view.innerHTML = `
    <div class="page-head">
      <div><p class="eyebrow">Compare</p><h2>${escapeHtml(portfolio.name)}</h2><span>Holdings and watchlist performance for the active portfolio.</span></div>
      <button type="button" data-action="refresh-performance">Update</button>
    </div>
    <div class="data-table compare-table">
      <div class="table-row table-head">
        ${["symbol", "price", "performance", "value", "pnl"].map((column) => `<button type="button" data-sort="${column}">${column}</button>`).join("")}
      </div>
      ${rows.map((row) => `
        <button class="table-row" type="button" data-action="open-stock" data-symbol="${row.symbol}">
          <span><strong>${row.symbol}</strong><small>${row.holding ? "Holding" : "Watchlist"}</small></span>
          <span>${money(row.quote?.regularMarketPrice)}</span>
          <span class="${Number(row.performance?.changePercent) >= 0 ? "positive" : "negative"}">${signedPercent(row.performance?.changePercent)} ${row.performance?.effectiveLabel ? `<small>(${escapeHtml(row.performance.effectiveLabel)})</small>` : ""}</span>
          <span>${row.stats ? money(row.stats.value) : "--"}</span>
          <span class="${Number(row.stats?.totalPnl) >= 0 ? "positive" : "negative"}">${row.stats ? signedMoney(row.stats.totalPnl) : "--"}</span>
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
            <div><h3>${escapeHtml(portfolio.name)}</h3><span>${portfolio.account_type === "crypto" ? "Crypto coming soon" : "US Stocks"}</span></div>
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
      state.page = state.selectedPortfolioId ? "portfolio" : "portfolios";
    }
    state.supabase.auth.onAuthStateChange(async (_event, session) => {
      state.session = session;
      if (session) {
        await loadCloudData();
        state.page = state.selectedPortfolioId ? "portfolio" : "portfolios";
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
    if (act === "new-portfolio") elements.dialog.showModal();
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
      await loadQuotes([state.selectedSymbol]);
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
  if (!searchForm && !tradeForm && !startingForm) return;
  event.preventDefault();
  try {
    if (searchForm) {
      await searchAssets(searchForm.querySelector("input").value);
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
  createPortfolio(event).catch((error) => setStatus(error.message, "warning"));
});

boot();
