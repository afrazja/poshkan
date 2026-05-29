const DEFAULT_SYMBOLS = ["AAPL", "MSFT", "NVDA", "TSLA"];
const STORAGE_KEY = "stock-dashboard-symbols";
const GROUPS_KEY = "stock-dashboard-groups";
const ACTIVE_GROUP_KEY = "stock-dashboard-active-group";
const CASH_KEY = "stock-dashboard-paper-cash";
const REALIZED_PNL_KEY = "stock-dashboard-realized-pnl";
const ALERT_DIRECTIONS = new Set(["above", "below"]);
const STARTING_CASH = 100000;

const state = {
  groups: loadGroups(),
  activeGroupId: localStorage.getItem(ACTIVE_GROUP_KEY) || "main",
  quotes: new Map(),
  cash: loadAccountCash(),
  realizedPnl: loadRealizedPnl(),
  selected: null,
  creatingGroup: false,
  renamingGroupId: null,
  draggingSymbol: null,
  authMode: "signin",
  chartPeriod: localStorage.getItem("stock-dashboard-chart-period") || "1d",
  customAmount: Number.parseInt(localStorage.getItem("stock-dashboard-custom-amount"), 10) || 2,
  customUnit: localStorage.getItem("stock-dashboard-custom-unit") || "days",
  chartMode: localStorage.getItem("stock-dashboard-chart-mode") || "line",
  showMA: localStorage.getItem("stock-dashboard-show-ma") !== "false",
  showVolume: localStorage.getItem("stock-dashboard-show-volume") !== "false",
  showDetailsPanel: localStorage.getItem("stock-dashboard-show-details-panel") !== "false",
  chartPoints: [],
  chartHoverIndex: null,
  alertEvents: [],
  firedAlerts: new Set(),
  supabase: null,
  session: null,
  cloudReady: false,
  cloudSaving: false,
  cloudSaveQueued: false,
  refreshMs: 30000,
  timer: null
};

const elements = {
  authPanel: document.querySelector("#auth-panel"),
  authForm: document.querySelector("#auth-form"),
  authEmail: document.querySelector("#auth-email"),
  authPassword: document.querySelector("#auth-password"),
  authUsername: document.querySelector("#auth-username"),
  authStartingCash: document.querySelector("#auth-starting-cash"),
  authExperience: document.querySelector("#auth-experience"),
  signupFields: document.querySelector("#signup-fields"),
  authModeButtons: document.querySelectorAll("[data-auth-mode]"),
  authSubmit: document.querySelector("#auth-submit"),
  authMessage: document.querySelector("#auth-message"),
  dashboardShell: document.querySelector("#dashboard-shell"),
  signOut: document.querySelector("#sign-out"),
  form: document.querySelector("#add-stock-form"),
  input: document.querySelector("#stock-symbol"),
  addStockMessage: document.querySelector("#add-stock-message"),
  groupTabs: document.querySelector("#group-tabs"),
  watchlist: document.querySelector(".watchlist"),
  workspace: document.querySelector(".workspace"),
  accountSummary: document.querySelector("#account-summary"),
  portfolioSummary: document.querySelector("#portfolio-summary"),
  stockList: document.querySelector("#stock-list"),
  refresh: document.querySelector("#refresh-now"),
  alertTray: document.querySelector("#alert-tray"),
  marketStatus: document.querySelector("#market-status"),
  lastUpdated: document.querySelector("#last-updated"),
  selectedName: document.querySelector("#selected-name"),
  selectedSymbol: document.querySelector("#selected-symbol"),
  selectedPrice: document.querySelector("#selected-price"),
  selectedChange: document.querySelector("#selected-change"),
  selectedPosition: document.querySelector("#selected-position"),
  details: document.querySelector(".details"),
  toggleDetails: document.querySelector("#toggle-details"),
  chart: document.querySelector("#price-chart"),
  chartHead: document.querySelector(".chart-head"),
  chartWrap: document.querySelector(".chart-wrap"),
  chartPeriodLabel: document.querySelector("#chart-period-label"),
  periodButtons: document.querySelectorAll(".period-control button"),
  chartModeButtons: document.querySelectorAll("[data-chart-mode]"),
  showMA: document.querySelector("#show-ma"),
  showVolume: document.querySelector("#show-volume"),
  customPeriodForm: document.querySelector("#custom-period-form"),
  customPeriodAmount: document.querySelector("#custom-period-amount"),
  customPeriodUnit: document.querySelector("#custom-period-unit"),
  newsHead: document.querySelector(".news-head"),
  newsList: document.querySelector("#news-list"),
  newsSource: document.querySelector("#news-source")
};

const PERIOD_LABELS = {
  "1h": "1 hour",
  "4h": "4 hours",
  "1d": "1 day",
  "5d": "5 days",
  "1mo": "1 month",
  "6mo": "6 months",
  "1y": "1 year"
};

const VALID_PERIODS = new Set(Object.keys(PERIOD_LABELS));
const VALID_CUSTOM_UNITS = new Set(["hours", "days", "months"]);

if (!VALID_PERIODS.has(state.chartPeriod) && state.chartPeriod !== "custom") {
  state.chartPeriod = "1d";
}

if (!VALID_CUSTOM_UNITS.has(state.customUnit)) {
  state.customUnit = "days";
}

if (!["line", "candles"].includes(state.chartMode)) {
  state.chartMode = "line";
}

state.customAmount = Math.max(1, Math.min(365, state.customAmount));

function loadGroups() {
  try {
    const saved = JSON.parse(localStorage.getItem(GROUPS_KEY));
    if (Array.isArray(saved) && saved.length) {
      return saved.map((group) => ({
        id: String(group.id || `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`),
        name: String(group.name || "Watchlist").slice(0, 18),
        symbols: Array.isArray(group.symbols) ? group.symbols.map(cleanSymbol).filter(Boolean) : [],
        portfolio: normalizePortfolio(group.portfolio),
        alerts: normalizeAlerts(group.alerts)
      }));
    }
  } catch {
  }

  return [
    {
      id: "main",
      name: "Main",
      symbols: loadSymbols(),
      portfolio: {},
      alerts: {}
    }
  ];
}

function normalizePortfolio(value) {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value)
      .map(([symbol, position]) => [
        cleanSymbol(symbol),
        {
          shares: Math.max(0, Number(position?.shares) || 0),
          avgCost: Math.max(0, Number(position?.avgCost) || 0)
        }
      ])
      .filter(([symbol]) => symbol)
  );
}

function normalizeAlerts(value) {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value)
      .map(([symbol, alert]) => [
        cleanSymbol(symbol),
        {
          active: Boolean(alert?.active),
          direction: ALERT_DIRECTIONS.has(alert?.direction) ? alert.direction : "above",
          target: Math.max(0, Number(alert?.target) || 0)
        }
      ])
      .filter(([symbol]) => symbol)
  );
}

function loadSymbols() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) && saved.length ? saved.map(cleanSymbol).filter(Boolean) : DEFAULT_SYMBOLS;
  } catch {
    return DEFAULT_SYMBOLS;
  }
}

function hasOpenPositions(groups = []) {
  return groups.some((group) =>
    Object.values(group?.portfolio || {}).some((position) => Number(position?.shares) > 0)
  );
}

function loadAccountCash() {
  const savedCash = Number(localStorage.getItem(CASH_KEY));
  if (Number.isFinite(savedCash)) {
    try {
      const groups = JSON.parse(localStorage.getItem(GROUPS_KEY));
      if (savedCash <= 0 && !hasOpenPositions(Array.isArray(groups) ? groups : [])) {
        return STARTING_CASH;
      }
    } catch {
      if (savedCash <= 0) return STARTING_CASH;
    }
    return Math.max(0, savedCash);
  }

  return STARTING_CASH;
}

function loadRealizedPnl() {
  const saved = Number(localStorage.getItem(REALIZED_PNL_KEY));
  return Number.isFinite(saved) ? saved : 0;
}

function activeGroup() {
  let group = state.groups.find((item) => item.id === state.activeGroupId);
  if (!group) {
    group = state.groups[0];
    state.activeGroupId = group.id;
  }
  group.portfolio ||= {};
  group.alerts ||= {};
  return group;
}

function currentSymbols() {
  return activeGroup()?.symbols || [];
}

function saveGroups() {
  localStorage.setItem(GROUPS_KEY, JSON.stringify(state.groups));
  localStorage.setItem(ACTIVE_GROUP_KEY, state.activeGroupId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSymbols()));
  localStorage.setItem(CASH_KEY, String(state.cash));
  localStorage.setItem(REALIZED_PNL_KEY, String(state.realizedPnl));
  queueCloudSave();
}

function positionFor(symbol) {
  const group = activeGroup();
  group.portfolio ||= {};
  group.portfolio[symbol] ||= { shares: 0, avgCost: 0 };
  return group.portfolio[symbol];
}

function alertFor(symbol) {
  const group = activeGroup();
  group.alerts ||= {};
  group.alerts[symbol] ||= { active: false, direction: "above", target: 0 };
  return group.alerts[symbol];
}

function positionStats(symbol) {
  const quote = state.quotes.get(symbol);
  const position = positionFor(symbol);
  const price = quote?.regularMarketPrice;
  const shares = Number(position.shares) || 0;
  const avgCost = Number(position.avgCost) || 0;
  const value = Number.isFinite(price) ? shares * price : 0;
  const cost = shares * avgCost;
  const pnl = value - cost;
  const pnlPercent = cost > 0 ? (pnl / cost) * 100 : 0;

  return { shares, avgCost, value, cost, pnl, pnlPercent };
}

function portfolioTotals() {
  const holdings = currentSymbols().reduce(
    (totals, symbol) => {
      const stats = positionStats(symbol);
      totals.value += stats.value;
      totals.cost += stats.cost;
      totals.pnl += stats.pnl;
      return totals;
    },
    { value: 0, cost: 0, pnl: 0 }
  );
  const cash = state.cash;
  return { ...holdings, cash, equity: holdings.value + cash };
}

function accountTotals() {
  const totals = state.groups.reduce(
    (account, group) => {
      const groupTotals = (group.symbols || []).reduce(
        (sum, symbol) => {
          const quote = state.quotes.get(symbol);
          const position = group.portfolio?.[symbol] || {};
          const shares = Number(position.shares) || 0;
          const avgCost = Number(position.avgCost) || 0;
          const value = Number.isFinite(quote?.regularMarketPrice) ? shares * quote.regularMarketPrice : 0;
          return {
            holdings: sum.holdings + value,
            cost: sum.cost + shares * avgCost
          };
        },
        { holdings: 0, cost: 0 }
      );

      return {
        holdings: account.holdings + groupTotals.holdings,
        cost: account.cost + groupTotals.cost
      };
    },
    { holdings: 0, cost: 0 }
  );
  const unrealizedPnl = totals.holdings - totals.cost;
  const realizedPnl = state.realizedPnl;
  return {
    ...totals,
    cash: state.cash,
    realizedPnl,
    unrealizedPnl,
    totalPnl: realizedPnl + unrealizedPnl
  };
}

function money(value) {
  return Number.isFinite(value)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)
    : "--";
}

function moneyAxis(value) {
  return Number.isFinite(value)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value)
    : "--";
}

function compact(value) {
  return Number.isFinite(value)
    ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value)
    : "--";
}

function relativeTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";

  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const units = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60]
  ];
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const [unit, size] = units.find(([, size]) => Math.abs(seconds) >= size) || ["minute", 60];
  return formatter.format(Math.round(seconds / size), unit);
}

function newsSentiment(article) {
  const text = `${article?.title || ""} ${article?.summary || ""}`.toLowerCase();
  const positive = ["beat", "beats", "gain", "gains", "growth", "upgrade", "raises", "rally", "record", "strong"];
  const negative = ["miss", "falls", "drop", "drops", "down", "cut", "lawsuit", "probe", "warning", "weak"];
  const score =
    positive.reduce((total, word) => total + (text.includes(word) ? 1 : 0), 0) -
    negative.reduce((total, word) => total + (text.includes(word) ? 1 : 0), 0);

  if (score > 0) return { label: "Positive", className: "positive" };
  if (score < 0) return { label: "Cautious", className: "cautious" };
  return { label: "Neutral", className: "neutral" };
}

function pointPrice(point) {
  return Number.isFinite(point?.close) ? point.close : point?.price;
}

function pointHigh(point) {
  return Number.isFinite(point?.high) ? point.high : pointPrice(point);
}

function pointLow(point) {
  return Number.isFinite(point?.low) ? point.low : pointPrice(point);
}

function movingAverage(points, windowSize) {
  let sum = 0;
  return points.map((point, index) => {
    sum += pointPrice(point);
    if (index >= windowSize) {
      sum -= pointPrice(points[index - windowSize]);
    }
    return index >= windowSize - 1 ? sum / windowSize : null;
  });
}

function signed(value, suffix = "") {
  if (!Number.isFinite(value)) return "--";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}${suffix}`;
}

function signedMoney(value) {
  if (!Number.isFinite(value)) return "--";
  const prefix = value >= 0 ? "+" : "-";
  return `${prefix}${money(Math.abs(value))}`;
}

function alertStatus(symbol) {
  const quote = state.quotes.get(symbol);
  const alert = alertFor(symbol);
  const price = quote?.regularMarketPrice;

  if (!alert.active || !Number.isFinite(alert.target) || alert.target <= 0) {
    return { label: "No alert", className: "idle", triggered: false };
  }

  const triggered =
    Number.isFinite(price) &&
    (alert.direction === "above" ? price >= alert.target : price <= alert.target);

  return {
    label: `${alert.direction === "above" ? "Above" : "Below"} ${moneyAxis(alert.target)}`,
    className: triggered ? "triggered" : "armed",
    triggered
  };
}

function alertKey(groupId, symbol, alert) {
  return `${groupId}:${symbol}:${alert.direction}:${Number(alert.target).toFixed(4)}`;
}

function evaluateAlerts(quotes) {
  const group = activeGroup();
  group.alerts ||= {};
  let triggeredCount = 0;

  quotes.forEach((quote) => {
    const alert = group.alerts[quote.symbol];
    if (!alert?.active || !Number.isFinite(alert.target) || alert.target <= 0) return;

    const price = quote.regularMarketPrice;
    const hit = Number.isFinite(price) && (alert.direction === "above" ? price >= alert.target : price <= alert.target);
    const key = alertKey(group.id, quote.symbol, alert);

    if (!hit) {
      state.firedAlerts.delete(key);
      return;
    }

    triggeredCount += 1;
    if (state.firedAlerts.has(key)) return;

    state.firedAlerts.add(key);
    state.alertEvents.unshift({
      key,
      symbol: quote.symbol,
      direction: alert.direction,
      target: alert.target,
      price,
      time: Date.now()
    });
  });

  state.alertEvents = state.alertEvents.slice(0, 4);
  renderAlertTray();
  return triggeredCount;
}

function renderAlertTray() {
  if (!state.alertEvents.length) {
    elements.alertTray.innerHTML = "";
    return;
  }

  elements.alertTray.innerHTML = state.alertEvents
    .map(
      (event) => `
        <div class="alert-toast">
          <strong>${escapeHtml(event.symbol)}</strong>
          <span>${event.direction === "above" ? "Above" : "Below"} ${moneyAxis(event.target)} at ${moneyAxis(
            event.price
          )}</span>
          <time>${new Date(event.time).toLocaleTimeString()}</time>
          <button type="button" data-alert-dismiss="${escapeHtml(event.key)}" title="Dismiss alert">x</button>
        </div>
      `
    )
    .join("");
}

function cardSparkline(symbol, quote, direction) {
  const width = 128;
  const height = 42;
  const change = Number.isFinite(quote?.regularMarketChangePercent) ? quote.regularMarketChangePercent : 0;
  const seed = [...symbol].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const points = Array.from({ length: 18 }, (_, index) => {
    const x = (index / 17) * width;
    const trend = (index / 17 - 0.5) * change * 1.7;
    const wave = Math.sin(index * 0.9 + seed) * 5 + Math.cos(index * 0.45 + seed / 3) * 2.5;
    const y = height / 2 - trend - wave;
    return [x, Math.max(5, Math.min(height - 5, y))];
  });
  const path = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const color = direction === "up" ? "#44d07b" : "#ff6b6b";

  return `
    <svg class="mini-chart" viewBox="0 0 ${width} ${height}" aria-hidden="true">
      <polyline points="${path}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `;
}

function timeLabel(seconds, options = {}) {
  if (!Number.isFinite(seconds)) return "--";
  return new Date(seconds * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    ...options
  });
}

function isIntradayChart() {
  return (
    ["1h", "4h", "1d"].includes(state.chartPeriod) ||
    (state.chartPeriod === "custom" && ["hours", "days"].includes(state.customUnit) && state.customAmount <= 5)
  );
}

function axisTimeLabel(seconds) {
  if (isIntradayChart()) {
    return timeLabel(seconds);
  }

  if (state.chartPeriod === "5d") {
    return new Date(seconds * 1000).toLocaleDateString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit"
    });
  }

  return new Date(seconds * 1000).toLocaleDateString([], {
    month: "short",
    day: "numeric"
  });
}

function tooltipTimeLabel(seconds) {
  if (isIntradayChart()) {
    return timeLabel(seconds, { second: "2-digit" });
  }

  return new Date(seconds * 1000).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: state.chartPeriod === "1y" ? "numeric" : undefined,
    hour: state.chartPeriod === "5d" ? "2-digit" : undefined,
    minute: state.chartPeriod === "5d" ? "2-digit" : undefined
  });
}

function chartLabel() {
  if (state.chartPeriod === "custom") {
    return `${state.customAmount} ${state.customUnit}`;
  }

  return PERIOD_LABELS[state.chartPeriod] || "Selected";
}

function historyQuery(symbol) {
  const params = new URLSearchParams({ symbol });

  if (state.chartPeriod === "custom") {
    params.set("period", "custom");
    params.set("amount", String(state.customAmount));
    params.set("unit", state.customUnit);
  } else {
    params.set("period", state.chartPeriod);
  }

  return params.toString();
}

function cleanSymbol(value) {
  return value.toUpperCase().replace(/[^A-Z0-9.^-]/g, "").slice(0, 12);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "#";
  } catch {
    return "#";
  }
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${response.status}`);
  }
  return response.json();
}

function setAuthMessage(message, type = "") {
  elements.authMessage.textContent = message || "";
  elements.authMessage.className = type;
}

function setAuthMode(mode) {
  state.authMode = mode === "signup" ? "signup" : "signin";
  elements.authForm.dataset.mode = state.authMode;
  elements.signupFields.hidden = state.authMode !== "signup";
  elements.authSubmit.textContent = state.authMode === "signup" ? "Create account" : "Sign in";
  elements.authPassword.autocomplete = state.authMode === "signup" ? "new-password" : "current-password";
  elements.authModeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.authMode === state.authMode);
  });
  setAuthMessage("");
}

function setAddStockMessage(message, type = "") {
  elements.addStockMessage.textContent = message || "";
  elements.addStockMessage.className = `add-stock-message ${type}`.trim();
}

async function ensureUuidGroupIds() {
  if (!state.supabase || !state.session) return;
  const userId = state.session.user.id;

  for (let index = 0; index < state.groups.length; index += 1) {
    const group = state.groups[index];
    if (isUuid(group.id)) continue;

    const { data, error } = await state.supabase
      .from("watchlists")
      .insert({ user_id: userId, name: group.name, sort_order: index })
      .select("id")
      .single();

    if (error) throw error;
    group.id = data.id;
  }
}

async function loadCloudData() {
  if (!state.supabase || !state.session) return;
  const userId = state.session.user.id;
  const localGroups = state.groups.map((group) => ({
    ...group,
    symbols: [...(group.symbols || [])],
    portfolio: { ...(group.portfolio || {}) },
    alerts: { ...(group.alerts || {}) }
  }));
  state.cloudReady = false;

  await state.supabase.from("profiles").upsert({
    id: userId,
    email: state.session.user.email
  });

  const { data: account, error: accountError } = await state.supabase
    .from("accounts")
    .select("cash, realized_pnl")
    .eq("user_id", userId)
    .maybeSingle();

  if (accountError) throw accountError;

  if (!account) {
    await ensureUuidGroupIds();
    await saveCloudData({ force: true });
  } else {
    state.cash = Number(account.cash) || 0;
    state.realizedPnl = Number(account.realized_pnl) || 0;

    const { data: watchlists, error: watchlistsError } = await state.supabase
      .from("watchlists")
      .select("id, name, sort_order")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true });
    if (watchlistsError) throw watchlistsError;

    if (!watchlists?.length && localGroups.some((group) => group.symbols?.length)) {
      state.groups = localGroups;
      state.activeGroupId = state.groups[0]?.id || "main";
      state.selected = currentSymbols()[0] || null;
      await ensureUuidGroupIds();
      state.cloudReady = true;
      await saveCloudData({ force: true });
      saveGroups();
      renderWatchlist();
      renderSelectedQuote();
      return;
    }

    const ids = (watchlists || []).map((group) => group.id);
    const [{ data: stocks, error: stocksError }, { data: positions, error: positionsError }, { data: alerts, error: alertsError }] =
      await Promise.all([
        ids.length
          ? state.supabase.from("watchlist_stocks").select("watchlist_id, symbol, created_at").in("watchlist_id", ids)
          : { data: [], error: null },
        state.supabase.from("positions").select("symbol, shares, avg_cost").eq("user_id", userId),
        state.supabase.from("alerts").select("symbol, active, direction, target").eq("user_id", userId)
      ]);

    if (stocksError) throw stocksError;
    if (positionsError) throw positionsError;
    if (alertsError) throw alertsError;

    if (watchlists?.length && !(stocks || []).length && localGroups.some((group) => group.symbols?.length)) {
      state.groups = localGroups;
      state.activeGroupId = state.groups[0]?.id || "main";
      state.selected = currentSymbols()[0] || null;
      await ensureUuidGroupIds();
      state.cloudReady = true;
      await saveCloudData({ force: true });
      saveGroups();
      renderWatchlist();
      renderSelectedQuote();
      return;
    }

    const portfolio = Object.fromEntries(
      (positions || []).map((position) => [
        cleanSymbol(position.symbol),
        { shares: Number(position.shares) || 0, avgCost: Number(position.avg_cost) || 0 }
      ])
    );
    const alertMap = Object.fromEntries(
      (alerts || []).map((alert) => [
        cleanSymbol(alert.symbol),
        {
          active: Boolean(alert.active),
          direction: ALERT_DIRECTIONS.has(alert.direction) ? alert.direction : "above",
          target: Number(alert.target) || 0
        }
      ])
    );

    state.groups =
      watchlists?.length
        ? watchlists.map((group) => ({
            id: group.id,
            name: group.name,
            symbols: (stocks || [])
              .filter((stock) => stock.watchlist_id === group.id)
              .map((stock) => cleanSymbol(stock.symbol))
              .filter(Boolean),
            portfolio: { ...portfolio },
            alerts: { ...alertMap }
          }))
        : [{ id: "main", name: "Main", symbols: DEFAULT_SYMBOLS, portfolio: {}, alerts: {} }];

    state.activeGroupId = state.groups[0]?.id || "main";
    state.selected = currentSymbols()[0] || null;
  }

  state.cloudReady = true;
  saveGroups();
  renderWatchlist();
  renderSelectedQuote();
}

function queueCloudSave() {
  if (!state.supabase || !state.session || !state.cloudReady) return;
  if (state.cloudSaving) {
    state.cloudSaveQueued = true;
    return;
  }

  state.cloudSaving = true;
  saveCloudData()
    .catch((error) => {
      elements.marketStatus.textContent = `Cloud save failed: ${error.message}`;
    })
    .finally(() => {
      state.cloudSaving = false;
      if (state.cloudSaveQueued) {
        state.cloudSaveQueued = false;
        queueCloudSave();
      }
    });
}

async function saveCloudData({ force = false } = {}) {
  if (!state.supabase || !state.session || (!state.cloudReady && !force)) return;
  const userId = state.session.user.id;
  await ensureUuidGroupIds();

  const saveResult = async (request) => {
    const { error } = await request;
    if (error) throw error;
  };

  await saveResult(
    state.supabase
    .from("accounts")
    .upsert(
      {
        user_id: userId,
        cash: state.cash,
        realized_pnl: state.realizedPnl
      },
      { onConflict: "user_id" }
    )
  );

  await saveResult(
    state.supabase.from("watchlists").upsert(
      state.groups.map((group, index) => ({
        id: group.id,
        user_id: userId,
        name: group.name,
        sort_order: index
      }))
    )
  );

  const ids = state.groups.map((group) => group.id).filter(isUuid);
  if (ids.length) {
    await saveResult(state.supabase.from("watchlist_stocks").delete().in("watchlist_id", ids));
  }

  const stocks = state.groups.flatMap((group) =>
    group.symbols.map((symbol) => ({
      watchlist_id: group.id,
      symbol
    }))
  );
  if (stocks.length) {
    await saveResult(state.supabase.from("watchlist_stocks").insert(stocks));
  }

  const symbols = [...new Set(state.groups.flatMap((group) => group.symbols))];
  await saveResult(state.supabase.from("positions").delete().eq("user_id", userId));
  await saveResult(state.supabase.from("alerts").delete().eq("user_id", userId));

  const activePositions = symbols
    .map((symbol) => {
      const group = state.groups.find((item) => item.portfolio?.[symbol]);
      const position = group?.portfolio?.[symbol];
      return position && Number(position.shares) > 0
        ? { user_id: userId, symbol, shares: position.shares, avg_cost: position.avgCost }
        : null;
    })
    .filter(Boolean);
  if (activePositions.length) {
    await saveResult(state.supabase.from("positions").insert(activePositions));
  }

  const activeAlerts = symbols
    .map((symbol) => {
      const group = state.groups.find((item) => item.alerts?.[symbol]);
      const alert = group?.alerts?.[symbol];
      return alert && (alert.active || Number(alert.target) > 0)
        ? { user_id: userId, symbol, active: alert.active, direction: alert.direction, target: alert.target }
        : null;
    })
    .filter(Boolean);
  if (activeAlerts.length) {
    await saveResult(state.supabase.from("alerts").insert(activeAlerts));
  }
}

function renderAuthState() {
  const isSignedIn = Boolean(state.session?.user);
  elements.authPanel.hidden = isSignedIn;
  elements.dashboardShell.hidden = !isSignedIn;

  if (isSignedIn) {
    elements.marketStatus.textContent = `Signed in as ${state.session.user.email}`;
  }
}

function clearSignedOutState(message = "Signed out.") {
  state.session = null;
  state.cloudReady = false;
  state.cloudSaving = false;
  state.cloudSaveQueued = false;
  setAuthMessage(message, "success");
  renderAuthState();
}

async function initializeAuth() {
  const config = await getJson("/api/config");

  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    setAuthMessage("Add SUPABASE_URL and SUPABASE_ANON_KEY to the server environment, then restart.", "error");
    elements.dashboardShell.hidden = true;
    elements.authPanel.hidden = false;
    return;
  }

  if (!window.supabase?.createClient) {
    setAuthMessage("Supabase client library did not load. Check your network connection.", "error");
    return;
  }

  state.supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  const { data, error } = await state.supabase.auth.getSession();
  if (error) {
    setAuthMessage(error.message, "error");
  }
  state.session = data?.session || null;
  renderAuthState();
  if (state.session) {
    await loadCloudData();
    await refreshQuotes();
    if (state.selected) refreshNews(state.selected);
  }

  state.supabase.auth.onAuthStateChange(async (_event, session) => {
    state.session = session;
    state.cloudReady = false;
    renderAuthState();
    if (session) {
      await loadCloudData();
      refreshQuotes().then(() => {
        if (state.selected) refreshNews(state.selected);
      });
    }
  });
}

function applyResolvedSymbols(quotes) {
  const group = activeGroup();
  let changed = false;

  quotes.forEach((quote) => {
    const requested = cleanSymbol(quote.requestedSymbol);
    const resolved = cleanSymbol(quote.symbol);
    if (!requested || !resolved || requested === resolved || !group.symbols.includes(requested)) return;

    group.symbols = group.symbols.map((symbol) => (symbol === requested ? resolved : symbol));
    if (group.portfolio?.[requested] && !group.portfolio[resolved]) {
      group.portfolio[resolved] = group.portfolio[requested];
    }
    if (group.alerts?.[requested] && !group.alerts[resolved]) {
      group.alerts[resolved] = group.alerts[requested];
    }
    delete group.portfolio?.[requested];
    delete group.alerts?.[requested];
    state.quotes.delete(requested);
    if (state.selected === requested) {
      state.selected = resolved;
    }
    changed = true;
  });

  if (changed) {
    group.symbols = [...new Set(group.symbols)];
    saveGroups();
  }
}

function invalidSymbolMessage(invalids = []) {
  const invalid = invalids[0];
  if (!invalid) return "";
  const suggestions = (invalid.suggestions || [])
    .slice(0, 4)
    .map((item) => {
      const name = item.name ? ` ${item.name}` : "";
      const exchange = item.exchange ? `, ${item.exchange}` : "";
      return `${item.symbol}${name}${exchange}`;
    })
    .join(" | ");
  return suggestions
    ? `${invalid.symbol} is not an available stock symbol. Try: ${suggestions}`
    : `${invalid.symbol} is not an available stock symbol. Check the ticker and exchange suffix.`;
}

function removeInvalidSymbols(invalids = []) {
  const invalidSymbols = new Set(invalids.map((invalid) => cleanSymbol(invalid.symbol)).filter(Boolean));
  if (!invalidSymbols.size) return false;

  const group = activeGroup();
  const beforeCount = group.symbols.length;
  group.symbols = group.symbols.filter((symbol) => !invalidSymbols.has(symbol));
  invalidSymbols.forEach((symbol) => {
    delete group.portfolio?.[symbol];
    delete group.alerts?.[symbol];
    state.quotes.delete(symbol);
  });

  if (invalidSymbols.has(state.selected)) {
    state.selected = group.symbols[0] || null;
  }

  const changed = group.symbols.length !== beforeCount;
  if (changed) saveGroups();
  return changed;
}

async function lookupStockBeforeAdd(symbol) {
  const data = await getJson(`/api/quotes?symbols=${encodeURIComponent(symbol)}`);
  if (data.invalids?.length || !data.quotes?.length) {
    setAddStockMessage(invalidSymbolMessage(data.invalids) || `${symbol} is not an available stock symbol.`, "error");
    return null;
  }

  const quote = data.quotes[0];
  if (!quote?.symbol || !Number.isFinite(quote.regularMarketPrice)) {
    setAddStockMessage(`${symbol} is not an available stock symbol.`, "error");
    return null;
  }

  return quote;
}

async function refreshQuotes({ quiet = false } = {}) {
  const symbols = currentSymbols();
  if (!symbols.length) {
    renderWatchlist();
    return;
  }

  if (!quiet) {
    elements.marketStatus.textContent = "Refreshing quotes...";
  }

  try {
    const data = await getJson(`/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`);
    const removedInvalids = removeInvalidSymbols(data.invalids || []);
    if (data.invalids?.length) {
      setAddStockMessage(invalidSymbolMessage(data.invalids), "error");
    }
    applyResolvedSymbols(data.quotes);
    data.quotes.forEach((quote) => state.quotes.set(quote.symbol, quote));
    const triggeredCount = evaluateAlerts(data.quotes);
    if (!currentSymbols().includes(state.selected)) {
      state.selected = data.quotes[0]?.symbol || null;
    }
    if (removedInvalids && !state.selected) {
      drawEmptyChart("Add or select a stock");
      elements.newsSource.textContent = "Click a stock to load headlines";
      elements.newsList.innerHTML = "";
    }
    if (data.source === "yahoo-chart") {
      if (!data.invalids?.length) {
        elements.marketStatus.textContent = triggeredCount
          ? `${triggeredCount} price alert${triggeredCount === 1 ? "" : "s"} triggered`
          : "Market prices from Yahoo Finance chart feed";
      }
    } else if (data.source === "mixed") {
      elements.marketStatus.textContent = data.warning || "Some prices refreshed; some are fallback demo values";
    } else {
      elements.marketStatus.textContent = "Demo prices shown because live market data is unreachable";
    }
    elements.lastUpdated.textContent = `Last update: ${new Date().toLocaleTimeString()}`;
    renderWatchlist();
    renderSelectedQuote();
    if (state.selected) {
      await refreshHistory(state.selected);
    }
  } catch (error) {
    elements.marketStatus.textContent = error.message;
  }
}

async function refreshHistory(symbol) {
  drawLoadingChart();
  try {
    const data = await getJson(`/api/history?${historyQuery(symbol)}`);
    elements.chartPeriodLabel.textContent = `${data.periodLabel || chartLabel()} price history`;
    drawChart(data.history);
  } catch {
    drawEmptyChart("Chart unavailable");
  }
}

function renderPeriodButtons() {
  elements.periodButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.period === state.chartPeriod);
  });
  elements.customPeriodAmount.value = state.customAmount;
  elements.customPeriodUnit.value = state.customUnit;
  elements.chartPeriodLabel.textContent = `${chartLabel()} price history`;
}

function renderChartControls() {
  elements.chartModeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.chartMode === state.chartMode);
  });
  elements.showMA.checked = state.showMA;
  elements.showVolume.checked = state.showVolume;
}

function renderSectionVisibility() {
  elements.workspace.classList.toggle("details-collapsed", !state.showDetailsPanel);
  elements.details.hidden = !state.showDetailsPanel;
  elements.toggleDetails.innerHTML = state.showDetailsPanel ? "&rsaquo;" : "&lsaquo;";
  elements.toggleDetails.setAttribute(
    "aria-label",
    state.showDetailsPanel ? "Hide chart and news panel" : "Show chart and news panel"
  );
  elements.toggleDetails.setAttribute("aria-expanded", String(state.showDetailsPanel));
}

function setDetailsPanelVisibility(visible) {
  state.showDetailsPanel = visible;
  localStorage.setItem("stock-dashboard-show-details-panel", String(visible));
  renderSectionVisibility();
  if (visible) {
    renderChart();
  }
}

function clearSelectedCard() {
  if (!state.selected) return;

  state.selected = null;
  renderWatchlist();
  renderSelectedQuote();
}

function executeTrade(symbol, action, quantity) {
  const quote = state.quotes.get(symbol);
  const price = quote?.regularMarketPrice;
  const qty = Math.max(0, Number(quantity) || 0);
  const position = positionFor(symbol);

  if (!qty || !Number.isFinite(price)) {
    elements.marketStatus.textContent = "Enter a share amount after the quote loads";
    return;
  }

  let tradeRealizedPnl = 0;
  if (action === "buy") {
    const cost = qty * price;
    if (cost > state.cash) {
      elements.marketStatus.textContent = `Not enough paper cash for ${qty} ${symbol}`;
      return;
    }

    const existingCost = position.shares * position.avgCost;
    position.shares += qty;
    position.avgCost = (existingCost + cost) / position.shares;
    state.cash -= cost;
    elements.marketStatus.textContent = `Bought ${qty} ${symbol} at ${moneyAxis(price)}`;
  } else {
    if (qty > position.shares) {
      elements.marketStatus.textContent = `You only have ${position.shares.toLocaleString()} ${symbol} shares`;
      return;
    }

    const realized = qty * (price - position.avgCost);
    tradeRealizedPnl = realized;
    position.shares -= qty;
    state.realizedPnl += realized;
    state.cash += qty * price;
    if (position.shares === 0) {
      position.avgCost = 0;
    }
    elements.marketStatus.textContent = `Sold ${qty} ${symbol} at ${moneyAxis(price)} (${signedMoney(realized)} realized)`;
  }

  state.cash = Math.max(0, Number(state.cash.toFixed(2)));
  state.realizedPnl = Number(state.realizedPnl.toFixed(2));
  position.shares = Math.max(0, Number(position.shares.toFixed(6)));
  position.avgCost = Math.max(0, Number(position.avgCost.toFixed(4)));
  saveGroups();
  if (state.supabase && state.session) {
    state.supabase
      .from("trades")
      .insert({
        user_id: state.session.user.id,
        symbol,
        side: action,
        shares: qty,
        price,
        realized_pnl: tradeRealizedPnl
      })
      .then(({ error }) => {
        if (error) elements.marketStatus.textContent = `Trade saved locally; cloud trade log failed: ${error.message}`;
      });
  }
  renderWatchlist();
  renderSelectedQuote();
}

function saveRenamedGroup(form) {
  const group = state.groups.find((item) => item.id === form.dataset.groupId);
  const name = form.querySelector("input").value.trim().slice(0, 18);

  if (group && name) {
    group.name = name;
    saveGroups();
  }

  state.renamingGroupId = null;
  renderWatchlist();
}

function showGroupInput() {
  state.creatingGroup = true;
  state.renamingGroupId = null;
  renderGroups();
  elements.groupTabs.querySelector("#group-name")?.focus();
}

function renderGroups() {
  const groupButtons = state.groups
    .map((group) => {
      const count = group.symbols.length;
      if (state.renamingGroupId === group.id) {
        return `
          <form class="rename-group-tab" data-group-id="${escapeHtml(group.id)}" autocomplete="off">
            <label class="sr-only" for="rename-${escapeHtml(group.id)}">Rename group</label>
            <input id="rename-${escapeHtml(group.id)}" name="groupName" value="${escapeHtml(group.name)}" maxlength="18" />
          </form>
        `;
      }

      const isActive = group.id === state.activeGroupId;
      return `
        <span class="group-tab ${isActive ? "active" : ""}">
          <button type="button" class="group-select" data-group-id="${escapeHtml(group.id)}" title="Double-click to rename">
            <span>${escapeHtml(group.name)}</span>
            <small>${count}</small>
          </button>
          ${
            isActive
              ? `<button type="button" class="remove-group-tab" data-action="remove-active-group" title="Remove current group">x</button>`
              : ""
          }
        </span>
      `;
    })
    .join("");

  const addGroupControl = state.creatingGroup
    ? `
      <form class="add-group-tab" autocomplete="off">
        <label class="sr-only" for="group-name">Group name</label>
        <input id="group-name" name="groupName" placeholder="Name" maxlength="18" />
        <button type="submit" title="Create group">+</button>
      </form>
    `
    : `<button type="button" class="add-group-tab-button" data-action="show-group-input" title="Add group">+</button>`;

  elements.groupTabs.innerHTML = groupButtons + addGroupControl;
}

function renderPortfolioSummary() {
  const totals = portfolioTotals();
  const pnlClass = totals.pnl >= 0 ? "up" : "down";
  const pnlPercent = totals.cost > 0 ? (totals.pnl / totals.cost) * 100 : 0;

  elements.portfolioSummary.innerHTML = `
    <div>
      <span>Holdings</span>
      <strong>${money(totals.value)}</strong>
    </div>
    <div>
      <span>Total equity</span>
      <strong>${money(totals.equity)}</strong>
    </div>
    <div>
      <span>P/L</span>
      <strong class="${pnlClass}">${signedMoney(totals.pnl)} (${signed(pnlPercent, "%")})</strong>
    </div>
  `;
}

function renderAccountSummary() {
  const totals = accountTotals();
  const realizedClass = totals.realizedPnl >= 0 ? "up" : "down";
  const unrealizedClass = totals.unrealizedPnl >= 0 ? "up" : "down";
  const totalClass = totals.totalPnl >= 0 ? "up" : "down";

  elements.accountSummary.innerHTML = `
    <div>
      <span>Cash available</span>
      <strong>${money(state.cash)}</strong>
    </div>
    <div>
      <span>Money in stocks</span>
      <strong>${money(totals.holdings)}</strong>
    </div>
    <div>
      <span>Realized P/L</span>
      <strong class="${realizedClass}">${signedMoney(totals.realizedPnl)}</strong>
    </div>
    <div>
      <span>Unrealized P/L</span>
      <strong class="${unrealizedClass}">${signedMoney(totals.unrealizedPnl)}</strong>
    </div>
    <div>
      <span>Total P/L</span>
      <strong class="${totalClass}">${signedMoney(totals.totalPnl)}</strong>
    </div>
    <button type="button" id="reset-paper-account">Reset</button>
  `;
}

function resetPaperAccount() {
  state.cash = STARTING_CASH;
  state.realizedPnl = 0;
  state.groups.forEach((group) => {
    group.portfolio = {};
  });
  saveGroups();
  renderWatchlist();
  renderSelectedQuote();
  elements.marketStatus.textContent = "Paper account reset to $100,000";
}

async function refreshNews(symbol) {
  elements.newsSource.textContent = "Loading headlines...";
  elements.newsList.innerHTML = `<div class="empty-state">Fetching related news for ${symbol}</div>`;

  try {
    const data = await getJson(`/api/news?symbol=${encodeURIComponent(symbol)}`);
    elements.newsSource.textContent =
      data.source === "yahoo" ? "Headlines from Yahoo Finance" : "Fallback links shown while news feed is unreachable";
    renderNews(data.articles);
  } catch (error) {
    elements.newsSource.textContent = error.message;
    elements.newsList.innerHTML = `<div class="empty-state">News is unavailable right now.</div>`;
  }
}

function renderWatchlist() {
  const group = activeGroup();
  const symbols = currentSymbols();
  renderGroups();
  renderAccountSummary();
  renderPortfolioSummary();

  if (!symbols.length) {
    elements.stockList.innerHTML = `<div class="empty-state">Add a ticker symbol to ${escapeHtml(
      group.name
    )}.</div>`;
    return;
  }

  elements.stockList.innerHTML = symbols
    .map((symbol) => {
      const quote = state.quotes.get(symbol);
      const change = quote?.regularMarketChange;
      const changePercent = quote?.regularMarketChangePercent;
      const direction = change >= 0 ? "up" : "down";
      const marketState = quote?.marketState || "WAIT";
      const stats = positionStats(symbol);
      const pnlDirection = stats.pnl >= 0 ? "up" : "down";
      const alert = alertFor(symbol);
      const status = alertStatus(symbol);
      const isSelected = state.selected === symbol;

      return `
        <article class="stock-card ${isSelected ? "active expanded" : "compact"} ${
          status.triggered ? "alert-hit" : ""
        }" data-symbol="${symbol}" draggable="true">
          <button class="stock-main" data-action="select" data-symbol="${symbol}">
            <span class="stock-title">
              <strong>${escapeHtml(symbol)}</strong>
              <em class="market-pill">${escapeHtml(marketState)}</em>
            </span>
            <span class="stock-name">${escapeHtml(quote?.shortName || "Waiting for quote")}</span>
            <span class="card-stats">
              <span>Vol ${compact(quote?.regularMarketVolume)}</span>
              <span>H ${moneyAxis(quote?.regularMarketDayHigh)}</span>
              <span>L ${moneyAxis(quote?.regularMarketDayLow)}</span>
            </span>
          </button>
          <button class="quote-meta" data-action="select" data-symbol="${symbol}">
            <strong>${money(quote?.regularMarketPrice)}</strong>
            <small class="change-badge ${direction}">${signed(change)} (${signed(changePercent, "%")})</small>
          </button>
          <button class="remove-stock" data-action="remove" data-symbol="${symbol}" title="Remove ${escapeHtml(
            symbol
          )}">x</button>
          ${
            isSelected
              ? `
                <div class="position-editor">
                  <div>
                    <span>Shares</span>
                    <strong>${stats.shares ? stats.shares.toLocaleString() : "--"}</strong>
                  </div>
                  <div>
                    <span>Avg cost</span>
                    <strong>${stats.avgCost ? money(stats.avgCost) : "--"}</strong>
                  </div>
                  <div class="position-pnl">
                    <span>Value ${money(stats.value)}</span>
                    <strong class="${pnlDirection}">${signedMoney(stats.pnl)} (${signed(stats.pnlPercent, "%")})</strong>
                  </div>
                </div>
                <div class="trade-editor">
                  <label>
                    <span>Paper trade</span>
                    <input type="number" min="0" step="0.0001" inputmode="decimal" data-trade-qty data-symbol="${symbol}" placeholder="Shares" />
                  </label>
                  <button type="button" data-trade-action="buy" data-symbol="${symbol}">Buy</button>
                  <button type="button" data-trade-action="sell" data-symbol="${symbol}">Sell</button>
                </div>
                <div class="alert-editor">
                  <label class="alert-switch">
                    <span>Alert</span>
                    <input type="checkbox" data-alert-field="active" data-symbol="${symbol}" ${alert.active ? "checked" : ""} />
                    <i aria-hidden="true"></i>
                  </label>
                  <label>
                    <span>Condition</span>
                    <select data-alert-field="direction" data-symbol="${symbol}">
                      <option value="above" ${alert.direction === "above" ? "selected" : ""}>Above</option>
                      <option value="below" ${alert.direction === "below" ? "selected" : ""}>Below</option>
                    </select>
                  </label>
                  <label>
                    <span>Target</span>
                    <input type="number" min="0" step="0.01" inputmode="decimal" data-alert-field="target" data-symbol="${symbol}" value="${
                      alert.target || ""
                    }" />
                  </label>
                </div>
              `
              : ""
          }
        </article>
      `;
    })
    .join("");
}

function renderSelectedQuote() {
  const quote = state.quotes.get(state.selected);
  if (!quote) {
    elements.selectedName.textContent = "Select a stock";
    elements.selectedSymbol.textContent = "--";
    elements.selectedPrice.textContent = "--";
    elements.selectedChange.textContent = "--";
    elements.selectedChange.className = "";
    elements.selectedPosition.innerHTML = "";
    drawEmptyChart("Add or select a stock");
    elements.newsSource.textContent = "Click a stock to load headlines";
    elements.newsList.innerHTML = "";
    return;
  }

  const change = quote.regularMarketChange;
  const direction = change >= 0 ? "up" : "down";

  elements.selectedName.textContent = quote.shortName || "Selected stock";
  elements.selectedSymbol.textContent = quote.symbol;
  elements.selectedPrice.textContent = money(quote.regularMarketPrice);
  const marketTime = quote.regularMarketTime
    ? new Date(quote.regularMarketTime * 1000).toLocaleTimeString()
    : "time unknown";
  elements.selectedChange.textContent = `${signed(change)} (${signed(quote.regularMarketChangePercent, "%")}) | Vol ${compact(
    quote.regularMarketVolume
  )} | ${quote.marketState || "DATA"} | ${marketTime}`;
  elements.selectedChange.className = direction;
  const stats = positionStats(quote.symbol);
  const pnlDirection = stats.pnl >= 0 ? "up" : "down";
  const selectedAlert = alertFor(quote.symbol);
  const selectedAlertStatus = alertStatus(quote.symbol);
  elements.selectedPosition.innerHTML = `
    <div>
      <span>Shares</span>
      <strong>${stats.shares ? stats.shares.toLocaleString() : "--"}</strong>
    </div>
    <div>
      <span>Avg cost</span>
      <strong>${stats.avgCost ? money(stats.avgCost) : "--"}</strong>
    </div>
    <div>
      <span>Position value</span>
      <strong>${money(stats.value)}</strong>
    </div>
    <div>
      <span>Position P/L</span>
      <strong class="${pnlDirection}">${signedMoney(stats.pnl)} (${signed(stats.pnlPercent, "%")})</strong>
    </div>
    <div>
      <span>Price alert</span>
      <strong class="${selectedAlertStatus.className === "triggered" ? "down" : ""}">${
        selectedAlert.active ? selectedAlertStatus.label : "--"
      }</strong>
    </div>
  `;
}

function renderNews(articles) {
  if (!articles.length) {
    elements.newsList.innerHTML = `<div class="empty-state news-empty">No related articles found.</div>`;
    return;
  }

  elements.newsList.innerHTML = articles
    .slice(0, 8)
    .map((article, index) => {
      const date = article.publishedAt ? new Date(article.publishedAt) : null;
      const sentiment = newsSentiment(article);
      const summary = article.summary || "Open the article for the full market context.";
      const shortSummary = summary.length > 190 ? `${summary.slice(0, 187).trim()}...` : summary;
      return `
        <article class="news-card ${index === 0 ? "featured" : ""}">
          <div class="news-meta-row">
            <span>${escapeHtml(article.publisher || "Market news")}</span>
            <span class="sentiment ${sentiment.className}">${sentiment.label}</span>
          </div>
          <a href="${safeUrl(article.link)}" target="_blank" rel="noreferrer">${escapeHtml(article.title)}</a>
          <p>${escapeHtml(shortSummary)}</p>
          <div class="news-foot">
            <time datetime="${date && !Number.isNaN(date.getTime()) ? date.toISOString() : ""}">
              ${escapeHtml(relativeTime(article.publishedAt) || "Recently")}
            </time>
            <span>${index === 0 ? "Top story" : `Story ${index + 1}`}</span>
          </div>
        </article>
      `;
    })
    .join("");
}

function fitCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const rect = elements.chart.getBoundingClientRect();
  elements.chart.width = Math.max(320, Math.round(rect.width * ratio));
  elements.chart.height = Math.max(180, Math.round(rect.height * ratio));
  return { ratio, width: elements.chart.width, height: elements.chart.height };
}

function drawLoadingChart() {
  state.chartPoints = [];
  state.chartHoverIndex = null;
  drawEmptyChart("Loading intraday chart...");
}

function drawEmptyChart(label) {
  state.chartPoints = [];
  state.chartHoverIndex = null;
  const { width, height } = fitCanvas();
  const ctx = elements.chart.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#9aa8af";
  ctx.font = `${16 * (window.devicePixelRatio || 1)}px system-ui`;
  ctx.textAlign = "center";
  ctx.fillText(label, width / 2, height / 2);
}

function drawChart(points) {
  const valid = points.filter((point) => Number.isFinite(point.price));
  if (valid.length < 2) {
    drawEmptyChart("Not enough price history yet");
    return;
  }

  state.chartPoints = valid;
  renderChart();
}

function renderChart() {
  const valid = state.chartPoints;
  if (valid.length < 2) return;

  const { width, height } = fitCanvas();
  const ctx = elements.chart.getContext("2d");
  const prices = valid.flatMap((point) => [pointLow(point), pointHigh(point)]).filter(Number.isFinite);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const yPadding = (max - min || max * 0.01 || 1) * 0.08;
  const yMin = min - yPadding;
  const yMax = max + yPadding;
  const axisLeft = Math.max(70, width * 0.08);
  const axisRight = Math.max(18, width * 0.018);
  const axisTop = Math.max(22, height * 0.07);
  const axisBottom = Math.max(48, height * 0.15);
  const plotLeft = axisLeft;
  const plotRight = width - axisRight;
  const plotTop = axisTop;
  const plotBottom = height - axisBottom;
  const plotWidth = plotRight - plotLeft;
  const volumeHeight = state.showVolume
    ? Math.min(Math.max(42, height * 0.18), Math.max(46, (plotBottom - plotTop) * 0.28))
    : 0;
  const volumeGap = volumeHeight ? Math.max(8, height * 0.025) : 0;
  const priceBottom = plotBottom - volumeHeight - volumeGap;
  const priceHeight = priceBottom - plotTop;
  const span = max - min || 1;
  const first = pointPrice(valid[0]);
  const last = pointPrice(valid[valid.length - 1]);
  const lineColor = last >= first ? "#44d07b" : "#ff6b6b";
  const volumeMax = Math.max(...valid.map((point) => Number(point.volume) || 0), 1);
  const candleWidth = Math.max(3, Math.min(13, (plotWidth / valid.length) * 0.66));

  const xFor = (index) => plotLeft + (index / (valid.length - 1)) * plotWidth;
  const yFor = (price) => priceBottom - ((price - yMin) / (yMax - yMin || span)) * priceHeight;
  const volumeYFor = (volume) => plotBottom - ((Number(volume) || 0) / volumeMax) * volumeHeight;

  ctx.clearRect(0, 0, width, height);

  ctx.save();
  ctx.strokeStyle = "rgba(238, 243, 245, 0.14)";
  ctx.fillStyle = "#9aa8af";
  ctx.lineWidth = Math.max(1, width / 1200);
  ctx.font = `${12 * (window.devicePixelRatio || 1)}px system-ui`;
  ctx.textBaseline = "middle";

  const yTicks = 5;
  for (let tick = 0; tick <= yTicks; tick += 1) {
    const ratio = tick / yTicks;
    const price = yMax - ratio * (yMax - yMin);
    const y = plotTop + ratio * priceHeight;
    ctx.beginPath();
    ctx.moveTo(plotLeft, y);
    ctx.lineTo(plotRight, y);
    ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillText(moneyAxis(price), plotLeft - 10, y);
  }

  const xTicks = Math.min(5, valid.length - 1);
  ctx.textBaseline = "top";
  for (let tick = 0; tick <= xTicks; tick += 1) {
    const index = Math.round((tick / xTicks) * (valid.length - 1));
    const x = xFor(index);
    ctx.beginPath();
    ctx.moveTo(x, plotTop);
    ctx.lineTo(x, plotBottom);
    ctx.stroke();
    ctx.textAlign = tick === 0 ? "left" : tick === xTicks ? "right" : "center";
    ctx.fillText(axisTimeLabel(valid[index].time), x, plotBottom + 12);
  }

  ctx.strokeStyle = "rgba(238, 243, 245, 0.38)";
  ctx.beginPath();
  ctx.moveTo(plotLeft, plotTop);
  ctx.lineTo(plotLeft, plotBottom);
  ctx.lineTo(plotRight, plotBottom);
  ctx.stroke();

  if (volumeHeight) {
    ctx.strokeStyle = "rgba(238, 243, 245, 0.22)";
    ctx.beginPath();
    ctx.moveTo(plotLeft, priceBottom + volumeGap / 2);
    ctx.lineTo(plotRight, priceBottom + volumeGap / 2);
    ctx.stroke();

    const barWidth = Math.max(2, Math.min(10, (plotWidth / valid.length) * 0.58));
    valid.forEach((point, index) => {
      const open = Number.isFinite(point.open) ? point.open : pointPrice(valid[index - 1]) || pointPrice(point);
      const close = pointPrice(point);
      const isUp = close >= open;
      const x = xFor(index) - barWidth / 2;
      const y = volumeYFor(point.volume);
      ctx.fillStyle = isUp ? "rgba(68, 208, 123, 0.34)" : "rgba(255, 107, 107, 0.34)";
      ctx.fillRect(x, y, barWidth, Math.max(1, plotBottom - y));
    });

    ctx.fillStyle = "#9aa8af";
    ctx.font = `${11 * (window.devicePixelRatio || 1)}px system-ui`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(compact(volumeMax), plotLeft - 10, priceBottom + volumeGap + 4);
  }

  ctx.fillStyle = "#eef3f5";
  ctx.textAlign = "center";
  ctx.fillText("Time", plotLeft + plotWidth / 2, height - 18);
  ctx.save();
  ctx.translate(18, plotTop + priceHeight / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Price", 0, 0);
  ctx.restore();

  if (state.chartMode === "candles") {
    valid.forEach((point, index) => {
      const close = pointPrice(point);
      const open = Number.isFinite(point.open) ? point.open : close;
      const high = pointHigh(point);
      const low = pointLow(point);
      const x = xFor(index);
      const isUp = close >= open;
      const color = isUp ? "#44d07b" : "#ff6b6b";
      const top = yFor(Math.max(open, close));
      const bottom = yFor(Math.min(open, close));

      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, width / 1200);
      ctx.beginPath();
      ctx.moveTo(x, yFor(high));
      ctx.lineTo(x, yFor(low));
      ctx.stroke();

      ctx.fillStyle = isUp ? "rgba(68, 208, 123, 0.85)" : "rgba(255, 107, 107, 0.85)";
      ctx.fillRect(x - candleWidth / 2, top, candleWidth, Math.max(1.5, bottom - top));
    });
  } else {
    ctx.lineWidth = Math.max(2, width / 420);
    ctx.strokeStyle = lineColor;
    ctx.beginPath();
    valid.forEach((point, index) => {
      const x = xFor(index);
      const y = yFor(pointPrice(point));
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const gradient = ctx.createLinearGradient(0, plotTop, 0, priceBottom);
    gradient.addColorStop(0, `${lineColor}55`);
    gradient.addColorStop(1, `${lineColor}00`);

    ctx.lineTo(xFor(valid.length - 1), priceBottom);
    ctx.lineTo(xFor(0), priceBottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  if (state.showMA) {
    [
      { label: "MA20", values: movingAverage(valid, 20), color: "#58c7f3" },
      { label: "MA50", values: movingAverage(valid, 50), color: "#f0c85a" }
    ].forEach((average, averageIndex) => {
      if (!average.values.some(Number.isFinite)) return;

      ctx.strokeStyle = average.color;
      ctx.lineWidth = Math.max(1.5, width / 720);
      ctx.beginPath();
      average.values.forEach((value, index) => {
        if (!Number.isFinite(value)) return;
        const x = xFor(index);
        const y = yFor(value);
        if (index === average.values.findIndex(Number.isFinite)) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      ctx.fillStyle = average.color;
      ctx.font = `${12 * (window.devicePixelRatio || 1)}px system-ui`;
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText(average.label, plotRight - averageIndex * 48, 4);
    });
  }

  ctx.fillStyle = "#eef3f5";
  ctx.font = `${14 * (window.devicePixelRatio || 1)}px system-ui`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`High ${money(max)}  Low ${money(min)}`, plotLeft, 4);

  if (Number.isInteger(state.chartHoverIndex)) {
    const hoverIndex = Math.max(0, Math.min(valid.length - 1, state.chartHoverIndex));
    const point = valid[hoverIndex];
    const hoverX = xFor(hoverIndex);
    const close = pointPrice(point);
    const hoverY = yFor(close);
    const tooltipLines =
      state.chartMode === "candles"
        ? [
            `C ${moneyAxis(close)}`,
            `O ${moneyAxis(point.open)}  H ${moneyAxis(pointHigh(point))}`,
            `L ${moneyAxis(pointLow(point))}  V ${compact(point.volume)}`,
            tooltipTimeLabel(point.time)
          ]
        : [moneyAxis(close), `Vol ${compact(point.volume)}`, tooltipTimeLabel(point.time)];
    const tooltipWidth = Math.max(...tooltipLines.map((line) => ctx.measureText(line).width)) + 22;
    const tooltipHeight = 18 + tooltipLines.length * 18;
    const tooltipX = Math.min(Math.max(hoverX + 12, plotLeft), plotRight - tooltipWidth);
    const tooltipY = Math.max(plotTop + 8, hoverY - tooltipHeight - 12);

    ctx.strokeStyle = "rgba(238, 243, 245, 0.5)";
    ctx.lineWidth = Math.max(1, width / 1100);
    ctx.beginPath();
    ctx.moveTo(hoverX, plotTop);
    ctx.lineTo(hoverX, plotBottom);
    ctx.moveTo(plotLeft, hoverY);
    ctx.lineTo(plotRight, hoverY);
    ctx.stroke();

    ctx.fillStyle = lineColor;
    ctx.beginPath();
    ctx.arc(hoverX, hoverY, Math.max(4, width / 260), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#121619";
    ctx.lineWidth = Math.max(2, width / 500);
    ctx.stroke();

    ctx.fillStyle = "rgba(18, 22, 25, 0.96)";
    ctx.strokeStyle = "rgba(238, 243, 245, 0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#eef3f5";
    ctx.font = `${13 * (window.devicePixelRatio || 1)}px system-ui`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    tooltipLines.forEach((line, index) => {
      ctx.fillStyle = index === 0 ? "#eef3f5" : "#9aa8af";
      ctx.fillText(line, tooltipX + 11, tooltipY + 9 + index * 18);
    });
  }

  ctx.restore();
}

async function selectStock(symbol) {
  state.selected = symbol;
  renderWatchlist();
  renderSelectedQuote();
  await Promise.all([refreshHistory(symbol), refreshNews(symbol)]);
}

function getDragAfterCard(container, x, y) {
  const cards = [...container.querySelectorAll(".stock-card:not(.dragging)")];
  return cards.find((card) => {
    const rect = card.getBoundingClientRect();
    const midpointY = rect.top + rect.height / 2;
    const midpointX = rect.left + rect.width / 2;
    const sameRow = y >= rect.top && y <= rect.bottom;
    return y < midpointY || (sameRow && x < midpointX);
  });
}

function saveDraggedCardOrder() {
  const group = activeGroup();
  const orderedSymbols = [...elements.stockList.querySelectorAll(".stock-card")]
    .map((card) => cleanSymbol(card.dataset.symbol))
    .filter(Boolean);

  if (orderedSymbols.length !== group.symbols.length) return;
  group.symbols = orderedSymbols;
  saveGroups();
  renderWatchlist();
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const group = activeGroup();
  const symbol = cleanSymbol(elements.input.value);
  if (!symbol || group.symbols.includes(symbol)) {
    if (symbol && group.symbols.includes(symbol)) {
      setAddStockMessage(`${symbol} is already in this group.`, "error");
    }
    elements.input.value = "";
    return;
  }

  setAddStockMessage(`Checking ${symbol}...`);
  const quote = await lookupStockBeforeAdd(symbol);
  if (!quote) {
    elements.input.select();
    return;
  }

  const resolvedSymbol = cleanSymbol(quote.symbol);
  if (group.symbols.includes(resolvedSymbol)) {
    elements.input.value = "";
    setAddStockMessage(`${resolvedSymbol} is already in this group.`, "error");
    return;
  }

  group.symbols = [resolvedSymbol, ...group.symbols].slice(0, 20);
  state.quotes.set(resolvedSymbol, quote);
  state.selected = resolvedSymbol;
  saveGroups();
  elements.input.value = "";
  setAddStockMessage(`${resolvedSymbol} added to ${group.name}.`, "success");
  await refreshQuotes();
  await refreshNews(resolvedSymbol);
});

elements.authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const action = state.authMode;
  const email = elements.authEmail.value.trim();
  const password = elements.authPassword.value;
  const username = elements.authUsername.value.trim().slice(0, 32);
  const startingCash = Math.min(Math.max(Number(elements.authStartingCash.value) || STARTING_CASH, 1000), 10000000);
  const experience = elements.authExperience.value;

  if (!state.supabase) {
    setAuthMessage("Supabase is not configured yet.", "error");
    return;
  }

  if (action === "signup" && (!username || !experience)) {
    setAuthMessage("Enter a user name and choose your trading experience.", "error");
    return;
  }

  setAuthMessage(action === "signup" ? "Creating account..." : "Signing in...");
  const request =
    action === "signup"
      ? state.supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username,
              starting_cash: startingCash,
              trading_experience: experience
            }
          }
        })
      : state.supabase.auth.signInWithPassword({ email, password });
  const { data, error } = await request;

  if (error) {
    setAuthMessage(error.message, "error");
    return;
  }

  state.session = data.session || null;
  if (action === "signup" && state.session) {
    state.cash = startingCash;
    state.realizedPnl = 0;
    saveGroups();
  }
  if (!data.session && action === "signup") {
    setAuthMessage("Account created. Check your email if confirmation is enabled.", "success");
    return;
  }

  setAuthMessage("");
  renderAuthState();
});

elements.authModeButtons.forEach((button) => {
  button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
});

elements.signOut.addEventListener("click", async () => {
  if (!state.supabase) return;
  elements.signOut.disabled = true;
  elements.signOut.textContent = "Signing out...";
  try {
    const { error } = await state.supabase.auth.signOut();
    if (error) throw error;
    clearSignedOutState();
  } catch (error) {
    await state.supabase.auth.signOut({ scope: "local" }).catch(() => {});
    clearSignedOutState(`Signed out locally. ${error.message || "Cloud sign-out did not finish."}`);
  } finally {
    elements.signOut.disabled = false;
    elements.signOut.textContent = "Sign out";
  }
});

elements.groupTabs.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  if (button.dataset.action === "show-group-input") {
    showGroupInput();
    return;
  }

  if (button.dataset.action === "remove-active-group") {
    const group = activeGroup();
    if (state.groups.length <= 1) {
      elements.marketStatus.textContent = "Keep at least one group";
      return;
    }

    const confirmed = window.confirm(`Remove "${group.name}" and its stocks, positions, and alerts?`);
    if (!confirmed) return;

    state.groups = state.groups.filter((item) => item.id !== group.id);
    state.activeGroupId = state.groups[0].id;
    state.creatingGroup = false;
    state.renamingGroupId = null;
    state.selected = currentSymbols()[0] || null;
    saveGroups();
    renderWatchlist();
    renderSelectedQuote();
    if (state.selected) {
      await refreshQuotes();
      await selectStock(state.selected);
    }
    return;
  }

  if (!button.dataset.groupId || button.dataset.groupId === state.activeGroupId) return;

  state.activeGroupId = button.dataset.groupId;
  state.creatingGroup = false;
  state.renamingGroupId = null;
  state.selected = currentSymbols()[0] || null;
  saveGroups();
  renderWatchlist();

  if (state.selected) {
    await refreshQuotes();
    await selectStock(state.selected);
  } else {
    renderSelectedQuote();
  }
});

elements.groupTabs.addEventListener("pointerdown", (event) => {
  const button = event.target.closest('button[data-action="show-group-input"]');
  if (!button) return;
  event.preventDefault();
  showGroupInput();
});

elements.groupTabs.addEventListener("dblclick", (event) => {
  const button = event.target.closest("button[data-group-id]");
  if (!button) return;

  state.creatingGroup = false;
  state.renamingGroupId = button.dataset.groupId;
  renderGroups();
  elements.groupTabs.querySelector(".rename-group-tab input")?.focus();
  elements.groupTabs.querySelector(".rename-group-tab input")?.select();
});

elements.groupTabs.addEventListener("submit", async (event) => {
  const renameForm = event.target.closest(".rename-group-tab");
  if (renameForm) {
    event.preventDefault();
    saveRenamedGroup(renameForm);
    return;
  }

  const form = event.target.closest(".add-group-tab");
  if (!form) return;

  event.preventDefault();
  const input = form.querySelector("#group-name");
  const name = input.value.trim().slice(0, 18);

  if (!name) {
    state.creatingGroup = false;
    renderGroups();
    return;
  }

  const id = `group-${Date.now().toString(36)}`;
  state.groups.push({ id, name, symbols: [], portfolio: {}, alerts: {} });
  state.activeGroupId = id;
  state.creatingGroup = false;
  state.renamingGroupId = null;
  state.selected = null;
  saveGroups();
  renderWatchlist();
  renderSelectedQuote();
});

elements.groupTabs.addEventListener("focusout", (event) => {
  const addForm = event.target.closest(".add-group-tab");
  if (addForm) {
    window.setTimeout(() => {
      const stillInsideForm = addForm.contains(document.activeElement);
      const name = addForm.querySelector("#group-name")?.value.trim();
      if (!stillInsideForm && state.creatingGroup && !name) {
        state.creatingGroup = false;
        renderGroups();
      }
    }, 0);
    return;
  }

  const form = event.target.closest(".rename-group-tab");
  if (!form || !state.renamingGroupId) return;
  window.setTimeout(() => {
    if (state.renamingGroupId === form.dataset.groupId) {
      saveRenamedGroup(form);
    }
  }, 0);
});

elements.refresh.addEventListener("click", () => refreshQuotes());

elements.accountSummary.addEventListener("click", (event) => {
  if (event.target.closest("#reset-paper-account")) {
    resetPaperAccount();
  }
});

elements.toggleDetails.addEventListener("click", () => setDetailsPanelVisibility(!state.showDetailsPanel));

elements.watchlist.addEventListener("click", (event) => {
  const keepSelection = event.target.closest(
    ".stock-card, form, .panel-title, .group-tabs, .portfolio-summary"
  );
  if (!keepSelection) {
    clearSelectedCard();
  }
});

elements.alertTray.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-alert-dismiss]");
  if (!button) return;

  const key = button.dataset.alertDismiss;
  state.alertEvents = state.alertEvents.filter((item) => item.key !== key);
  renderAlertTray();
});

elements.stockList.addEventListener("click", async (event) => {
  if (state.draggingSymbol) return;
  const button = event.target.closest("button");
  if (!button) return;

  if (button.dataset.tradeAction) {
    const symbol = cleanSymbol(button.dataset.symbol);
    const card = button.closest(".stock-card");
    const qty = card?.querySelector("input[data-trade-qty]")?.value;
    executeTrade(symbol, button.dataset.tradeAction, qty);
    return;
  }

  const symbol = button.dataset.symbol;
  if (button.dataset.action === "remove") {
    const group = activeGroup();
    group.symbols = group.symbols.filter((item) => item !== symbol);
    delete group.portfolio?.[symbol];
    delete group.alerts?.[symbol];
    state.quotes.delete(symbol);
    state.selected = group.symbols[0] || null;
    saveGroups();
    renderWatchlist();
    renderSelectedQuote();
    if (state.selected) await selectStock(state.selected);
    return;
  }

  if (button.dataset.action === "select") {
    await selectStock(symbol);
  }
});

elements.stockList.addEventListener("dragstart", (event) => {
  const card = event.target.closest(".stock-card");
  if (!card || event.target.closest("input, select, label")) {
    event.preventDefault();
    return;
  }

  state.draggingSymbol = cleanSymbol(card.dataset.symbol);
  card.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", state.draggingSymbol);
});

elements.stockList.addEventListener("dragover", (event) => {
  if (!state.draggingSymbol) return;
  event.preventDefault();
  const draggingCard = elements.stockList.querySelector(".stock-card.dragging");
  if (!draggingCard) return;

  const afterCard = getDragAfterCard(elements.stockList, event.clientX, event.clientY);
  if (afterCard) {
    elements.stockList.insertBefore(draggingCard, afterCard);
  } else {
    elements.stockList.appendChild(draggingCard);
  }
});

elements.stockList.addEventListener("drop", (event) => {
  if (!state.draggingSymbol) return;
  event.preventDefault();
  saveDraggedCardOrder();
});

elements.stockList.addEventListener("dragend", () => {
  const draggingCard = elements.stockList.querySelector(".stock-card.dragging");
  draggingCard?.classList.remove("dragging");
  state.draggingSymbol = null;
});

elements.stockList.addEventListener("change", (event) => {
  const alertInput = event.target.closest("[data-alert-field]");
  if (alertInput) {
    const symbol = cleanSymbol(alertInput.dataset.symbol);
    const field = alertInput.dataset.alertField;
    if (!symbol || !["active", "direction", "target"].includes(field)) return;

    const alert = alertFor(symbol);
    if (field === "active") {
      alert.active = alertInput.checked;
    } else if (field === "direction") {
      alert.direction = ALERT_DIRECTIONS.has(alertInput.value) ? alertInput.value : "above";
    } else {
      alert.target = Math.max(0, Number(alertInput.value) || 0);
    }

    state.firedAlerts.delete(alertKey(activeGroup().id, symbol, alert));
    saveGroups();
    evaluateAlerts([state.quotes.get(symbol)].filter(Boolean));
    renderWatchlist();
    renderSelectedQuote();
    return;
  }
});

elements.periodButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const nextPeriod = button.dataset.period;
    if (!nextPeriod || nextPeriod === state.chartPeriod) return;

    state.chartPeriod = nextPeriod;
    localStorage.setItem("stock-dashboard-chart-period", nextPeriod);
    renderPeriodButtons();
    if (state.selected) {
      await refreshHistory(state.selected);
    }
  });
});

elements.customPeriodForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const unit = VALID_CUSTOM_UNITS.has(elements.customPeriodUnit.value)
    ? elements.customPeriodUnit.value
    : "days";
  const maxByUnit = { hours: 168, days: 365, months: 60 };
  const amount = Math.min(
    Math.max(Number.parseInt(elements.customPeriodAmount.value, 10) || 1, 1),
    maxByUnit[unit]
  );

  state.chartPeriod = "custom";
  state.customAmount = amount;
  state.customUnit = unit;
  localStorage.setItem("stock-dashboard-chart-period", "custom");
  localStorage.setItem("stock-dashboard-custom-amount", String(amount));
  localStorage.setItem("stock-dashboard-custom-unit", unit);
  renderPeriodButtons();

  if (state.selected) {
    await refreshHistory(state.selected);
  }
});

elements.chartModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const mode = button.dataset.chartMode;
    if (!["line", "candles"].includes(mode) || mode === state.chartMode) return;

    state.chartMode = mode;
    localStorage.setItem("stock-dashboard-chart-mode", mode);
    renderChartControls();
    renderChart();
  });
});

elements.showMA.addEventListener("change", () => {
  state.showMA = elements.showMA.checked;
  localStorage.setItem("stock-dashboard-show-ma", String(state.showMA));
  renderChart();
});

elements.showVolume.addEventListener("change", () => {
  state.showVolume = elements.showVolume.checked;
  localStorage.setItem("stock-dashboard-show-volume", String(state.showVolume));
  renderChart();
});

elements.chart.addEventListener("mousemove", (event) => {
  if (state.chartPoints.length < 2) return;

  const rect = elements.chart.getBoundingClientRect();
  const ratio = elements.chart.width / rect.width;
  const x = (event.clientX - rect.left) * ratio;
  const y = (event.clientY - rect.top) * ratio;
  const width = elements.chart.width;
  const height = elements.chart.height;
  const plotLeft = Math.max(70, width * 0.08);
  const plotRight = width - Math.max(18, width * 0.018);
  const plotTop = Math.max(22, height * 0.07);
  const plotBottom = height - Math.max(48, height * 0.15);

  if (x < plotLeft || x > plotRight || y < plotTop || y > plotBottom) {
    if (state.chartHoverIndex !== null) {
      state.chartHoverIndex = null;
      renderChart();
    }
    return;
  }

  const nextIndex = Math.round(((x - plotLeft) / (plotRight - plotLeft)) * (state.chartPoints.length - 1));
  const clampedIndex = Math.max(0, Math.min(state.chartPoints.length - 1, nextIndex));

  if (state.chartHoverIndex !== clampedIndex) {
    state.chartHoverIndex = clampedIndex;
    renderChart();
  }
});

elements.chart.addEventListener("mouseleave", () => {
  if (state.chartHoverIndex !== null) {
    state.chartHoverIndex = null;
    renderChart();
  }
});

window.addEventListener("resize", () => {
  if (state.selected) refreshHistory(state.selected);
});

renderPeriodButtons();
renderChartControls();
renderSectionVisibility();
setAuthMode("signin");

initializeAuth();

state.timer = window.setInterval(() => {
  if (state.session) refreshQuotes({ quiet: true });
}, state.refreshMs);
