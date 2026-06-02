const DEFAULT_SYMBOLS = ["AAPL", "MSFT", "NVDA", "TSLA"];
const STORAGE_KEY = "stock-dashboard-symbols";
const GROUPS_KEY = "stock-dashboard-groups";
const ACTIVE_GROUP_KEY = "stock-dashboard-active-group";
const PORTFOLIO_MODE_KEY = "stock-dashboard-portfolio-mode";
const REAL_POSITIONS_KEY = "stock-dashboard-real-positions";
const REAL_WATCHLIST_KEY = "stock-dashboard-real-watchlist";
const REAL_TRANSACTIONS_KEY = "stock-dashboard-real-transactions";
const REAL_REMOVED_SYMBOLS_KEY = "stock-dashboard-real-removed-symbols";
const REAL_ACTIVE_TAB_KEY = "stock-dashboard-real-active-tab";
const CASH_KEY = "stock-dashboard-paper-cash";
const REALIZED_PNL_KEY = "stock-dashboard-realized-pnl";
const PAPER_TRANSACTIONS_KEY = "stock-dashboard-paper-transactions";
const ALERT_DIRECTIONS = new Set(["above", "below"]);
const STARTING_CASH = 100000;

const state = {
  groups: loadGroups(),
  activeGroupId: localStorage.getItem(ACTIVE_GROUP_KEY) || "main",
  portfolioMode: localStorage.getItem(PORTFOLIO_MODE_KEY) === "real" ? "real" : "paper",
  realPositions: loadRealPositions(),
  realWatchlist: loadRealWatchlist(),
  realTransactions: loadRealTransactions(),
  removedRealSymbols: loadRemovedRealSymbols(),
  activeRealTab: localStorage.getItem(REAL_ACTIVE_TAB_KEY) === "watchlist" ? "watchlist" : "owned",
  quotes: new Map(),
  cash: loadAccountCash(),
  realizedPnl: loadRealizedPnl(),
  paperTransactions: loadPaperTransactions(),
  selected: null,
  creatingGroup: false,
  renamingGroupId: null,
  draggingSymbol: null,
  authMode: "signin",
  chartPeriod: localStorage.getItem("stock-dashboard-chart-period") || "1d",
  customAmount: Number.parseInt(localStorage.getItem("stock-dashboard-custom-amount"), 10) || 2,
  customUnit: localStorage.getItem("stock-dashboard-custom-unit") || "days",
  comparisonAmount: Number.parseInt(localStorage.getItem("stock-dashboard-comparison-amount"), 10) || 4,
  comparisonUnit: localStorage.getItem("stock-dashboard-comparison-unit") || "days",
  comparisonSort: localStorage.getItem("stock-dashboard-comparison-sort") || "performance",
  comparisonSortDirection: localStorage.getItem("stock-dashboard-comparison-sort-direction") === "asc" ? "asc" : "desc",
  comparisonLoading: false,
  comparisonPageOpen: false,
  stockSearch: "",
  performance: new Map(),
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
  paperApiKeysEnabled: false,
  realPositionsCloudEnabled: false,
  realTransactionsCloudEnabled: false,
  cloudReady: false,
  cloudSaving: false,
  cloudSaveQueued: false,
  refreshMs: 30000,
  paperSyncMs: 8000,
  paperSyncing: false,
  timer: null,
  paperTimer: null
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
  realPositionForm: document.querySelector("#real-position-form"),
  realSymbol: document.querySelector("#real-symbol"),
  realShares: document.querySelector("#real-shares"),
  realAvgCost: document.querySelector("#real-avg-cost"),
  watchlistAddTitle: document.querySelector("#watchlist-add-title"),
  groupLabel: document.querySelector("#group-label"),
  portfolioModeButtons: document.querySelectorAll("[data-portfolio-mode]"),
  mobileNavButtons: document.querySelectorAll("[data-mobile-nav]"),
  mobileAlertCount: document.querySelector("#mobile-alert-count"),
  portfolioHealth: document.querySelector("#portfolio-health"),
  input: document.querySelector("#stock-symbol"),
  addStockMessage: document.querySelector("#add-stock-message"),
  groupTabs: document.querySelector("#group-tabs"),
  watchlist: document.querySelector(".watchlist"),
  workspace: document.querySelector(".workspace"),
  comparisonPage: document.querySelector("#comparison-page"),
  openComparison: document.querySelector("#open-comparison"),
  backToCards: document.querySelector("#back-to-cards"),
  accountSummary: document.querySelector("#account-summary"),
  apiKeyPanel: document.querySelector("#api-key-panel"),
  apiKeyCreate: document.querySelector("#create-api-key"),
  apiKeySecret: document.querySelector("#api-key-secret"),
  apiKeyList: document.querySelector("#api-key-list"),
  apiKeyMessage: document.querySelector("#api-key-message"),
  portfolioSummary: document.querySelector("#portfolio-summary"),
  paperTradeHistory: document.querySelector("#paper-trade-history"),
  realTradeHistory: document.querySelector("#real-trade-history"),
  comparisonPeriodLabel: document.querySelector("#comparison-period-label"),
  comparisonControls: document.querySelector("#comparison-controls"),
  comparisonAmount: document.querySelector("#comparison-amount"),
  comparisonUnit: document.querySelector("#comparison-unit"),
  comparisonSort: document.querySelector("#comparison-sort"),
  comparisonRefresh: document.querySelector("#refresh-comparison"),
  comparisonTable: document.querySelector("#comparison-table"),
  stockSearch: document.querySelector("#stock-search"),
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

if (!VALID_CUSTOM_UNITS.has(state.comparisonUnit)) {
  state.comparisonUnit = "days";
}

if (!["performance", "value", "pnl", "price", "symbol", "dayChange", "shares"].includes(state.comparisonSort)) {
  state.comparisonSort = "performance";
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
          avgCost: Math.max(0, Number(position?.avgCost) || 0),
          openedAt: Number(position?.openedAt) || null
        }
      ])
      .filter(([symbol]) => symbol)
  );
}

function loadRealPositions() {
  try {
    return normalizePortfolio(JSON.parse(localStorage.getItem(REAL_POSITIONS_KEY)));
  } catch {
    return {};
  }
}

function loadRealWatchlist() {
  try {
    const saved = JSON.parse(localStorage.getItem(REAL_WATCHLIST_KEY));
    return Array.isArray(saved) ? [...new Set(saved.map(cleanSymbol).filter(Boolean))] : [];
  } catch {
    return [];
  }
}

function normalizeRealTransaction(transaction) {
  const symbol = cleanSymbol(transaction?.symbol);
  const type = String(transaction?.type || "").toLowerCase();
  const shares = Math.max(0, Number(transaction?.shares) || 0);
  const price = Math.max(0, Number(transaction?.price) || 0);
  const avgCost = Math.max(0, Number(transaction?.avgCost) || 0);
  const total = Number(transaction?.total) || shares * price || shares * avgCost || 0;
  const createdAt = Number(transaction?.createdAt) || Date.now();
  if (!symbol || !["set", "buy", "sell"].includes(type)) return null;
  return {
    id: String(transaction?.id || `${createdAt}-${symbol}-${type}-${Math.random().toString(36).slice(2)}`),
    symbol,
    type,
    shares,
    price,
    avgCost,
    total,
    realizedPnl: Number(transaction?.realizedPnl) || 0,
    createdAt,
    source: String(transaction?.source || "")
  };
}

function loadRealTransactions() {
  try {
    const saved = JSON.parse(localStorage.getItem(REAL_TRANSACTIONS_KEY));
    return Array.isArray(saved) ? saved.map(normalizeRealTransaction).filter(Boolean).slice(0, 200) : [];
  } catch {
    return [];
  }
}

function loadPaperTransactions() {
  try {
    const saved = JSON.parse(localStorage.getItem(PAPER_TRANSACTIONS_KEY));
    return Array.isArray(saved) ? saved.map(normalizeRealTransaction).filter(Boolean).slice(0, 200) : [];
  } catch {
    return [];
  }
}

function loadRemovedRealSymbols() {
  try {
    const saved = JSON.parse(localStorage.getItem(REAL_REMOVED_SYMBOLS_KEY));
    return new Set(Array.isArray(saved) ? saved.map(cleanSymbol).filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

function isRealMode() {
  return state.portfolioMode === "real";
}

function isPaperMode() {
  return !isRealMode();
}

function isRealOwnedTab() {
  return isRealMode() && state.activeRealTab === "owned";
}

function isRealWatchlistTab() {
  return isRealMode() && state.activeRealTab === "watchlist";
}

function mergeLocalRealPortfolio(localPositions = {}, localWatchlist = []) {
  let changed = false;
  const cloudPositions = state.realPositions || {};

  Object.entries(normalizePortfolio(localPositions)).forEach(([symbol, position]) => {
    if (state.removedRealSymbols.has(symbol)) {
      changed = true;
      return;
    }
    if (!cloudPositions[symbol] && Number(position.shares) > 0) {
      cloudPositions[symbol] = position;
      changed = true;
    } else if (cloudPositions[symbol] && !cloudPositions[symbol].openedAt && position.openedAt) {
      cloudPositions[symbol].openedAt = position.openedAt;
      changed = true;
    }
  });

  const ownedSymbols = new Set(Object.keys(cloudPositions));
  const previousWatchlist = (state.realWatchlist || []).join("|");
  const watchlist = [...new Set([...(state.realWatchlist || []), ...(localWatchlist || [])].map(cleanSymbol).filter(Boolean))]
    .filter((symbol) => !ownedSymbols.has(symbol) && !state.removedRealSymbols.has(symbol));
  if (watchlist.join("|") !== previousWatchlist) {
    changed = true;
  }

  state.realPositions = cloudPositions;
  state.realWatchlist = watchlist;
  return changed;
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
  if (isRealMode()) {
    return isRealOwnedTab() ? Object.keys(state.realPositions) : state.realWatchlist;
  }
  return activeGroup()?.symbols || [];
}

function visibleStockSymbols(symbols) {
  const query = state.stockSearch.trim().toLowerCase();
  if (!query) return symbols;

  return symbols.filter((symbol) => {
    const quote = state.quotes.get(symbol);
    return (
      symbol.toLowerCase().includes(query) ||
      (quote?.shortName || "").toLowerCase().includes(query) ||
      (quote?.longName || "").toLowerCase().includes(query)
    );
  });
}

function clearStockSearch() {
  state.stockSearch = "";
  if (elements.stockSearch) elements.stockSearch.value = "";
}

function ensurePositionSymbolsVisible() {
  const heldSymbols = [
    ...new Set(
      state.groups.flatMap((group) =>
        Object.entries(group.portfolio || {})
          .filter(([, position]) => Number(position?.shares) > 0)
          .map(([symbol]) => cleanSymbol(symbol))
      )
    )
  ].filter(Boolean);
  const firstGroup = state.groups[0] || activeGroup();
  const paperGroup = state.groups.find((group) => group.name === "Paper positions");
  const firstSymbols = new Set(firstGroup.symbols || []);
  const paperSymbols = new Set((paperGroup?.symbols || []).map(cleanSymbol));
  const missingSymbols = heldSymbols.filter((symbol) => !firstSymbols.has(symbol) || paperSymbols.has(symbol));
  if (!missingSymbols.length) return;

  firstGroup.symbols = [...new Set([...firstGroup.symbols, ...missingSymbols])];
  missingSymbols.forEach((symbol) => {
    const sourceGroup = state.groups.find((group) => group.portfolio?.[symbol]);
    if (sourceGroup?.portfolio?.[symbol]) {
      firstGroup.portfolio ||= {};
      firstGroup.portfolio[symbol] = sourceGroup.portfolio[symbol];
    }
  });

  state.groups = state.groups.filter(
    (group) => group.name !== "Paper positions" || group.symbols.some((symbol) => !firstGroup.symbols.includes(symbol))
  );
}

function saveGroups() {
  ensurePositionSymbolsVisible();
  localStorage.setItem(PORTFOLIO_MODE_KEY, state.portfolioMode);
  localStorage.setItem(REAL_POSITIONS_KEY, JSON.stringify(state.realPositions));
  localStorage.setItem(REAL_WATCHLIST_KEY, JSON.stringify(state.realWatchlist));
  localStorage.setItem(REAL_TRANSACTIONS_KEY, JSON.stringify(state.realTransactions));
  localStorage.setItem(REAL_REMOVED_SYMBOLS_KEY, JSON.stringify([...state.removedRealSymbols]));
  localStorage.setItem(PAPER_TRANSACTIONS_KEY, JSON.stringify(state.paperTransactions));
  localStorage.setItem(REAL_ACTIVE_TAB_KEY, state.activeRealTab);
  localStorage.setItem(GROUPS_KEY, JSON.stringify(state.groups));
  localStorage.setItem(ACTIVE_GROUP_KEY, state.activeGroupId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(activeGroup()?.symbols || []));
  localStorage.setItem(CASH_KEY, String(state.cash));
  localStorage.setItem(REALIZED_PNL_KEY, String(state.realizedPnl));
  queueCloudSave();
}

function recordRealTransaction(transaction) {
  const normalized = normalizeRealTransaction({
    ...transaction,
    id: `${Date.now()}-${cleanSymbol(transaction.symbol)}-${transaction.type}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now()
  });
  if (!normalized) return;
  state.realTransactions = [normalized, ...(state.realTransactions || [])].slice(0, 200);
}

function recordPaperTransaction(transaction) {
  const normalized = normalizeRealTransaction({
    ...transaction,
    id: `${Date.now()}-${cleanSymbol(transaction.symbol)}-${transaction.type}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now()
  });
  if (!normalized) return;
  state.paperTransactions = [normalized, ...(state.paperTransactions || [])].slice(0, 200);
}

function paperTransactionsFromTrades(trades = []) {
  return trades
    .map((trade) =>
      normalizeRealTransaction({
        id: `${trade.created_at || Date.now()}-${cleanSymbol(trade.symbol)}-${trade.side}`,
        symbol: trade.symbol,
        type: trade.side,
        shares: trade.shares,
        price: trade.price,
        total: Number(trade.shares) * Number(trade.price),
        realizedPnl: trade.realized_pnl,
        createdAt: trade.created_at ? Date.parse(trade.created_at) : Date.now(),
        source: "paper-broker"
      })
    )
    .filter(Boolean)
    .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
    .slice(0, 200);
}

function positionFor(symbol) {
  if (isRealMode()) {
    return state.realPositions[symbol] || { shares: 0, avgCost: 0 };
  }
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

function positionOpenedAt(symbol) {
  const openedAt = Number(positionFor(symbol)?.openedAt);
  return Number.isFinite(openedAt) && openedAt > 0 ? openedAt : null;
}

function portfolioTotals(symbols = currentSymbols()) {
  const holdings = symbols.reduce(
    (totals, symbol) => {
      const stats = positionStats(symbol);
      totals.value += stats.value;
      totals.cost += stats.cost;
      totals.pnl += stats.pnl;
      return totals;
    },
    { value: 0, cost: 0, pnl: 0 }
  );
  const cash = isRealMode() ? 0 : state.cash;
  return { ...holdings, cash, equity: holdings.value + cash };
}

function healthRows() {
  const rows = isRealMode()
    ? Object.keys(state.realPositions).map((symbol) => {
        const quote = state.quotes.get(symbol);
        const stats = positionStats(symbol);
        return {
          symbol,
          name: quote?.shortName || symbol,
          price: quote?.regularMarketPrice,
          dayChange: quote?.regularMarketChangePercent,
          shares: stats.shares,
          value: stats.value,
          pnl: stats.pnl,
          pnlPercent: stats.pnlPercent
        };
      })
    : state.groups.flatMap((group) =>
        Object.entries(group.portfolio || {}).map(([rawSymbol, position]) => {
          const symbol = cleanSymbol(rawSymbol);
          const quote = state.quotes.get(symbol);
          const shares = Number(position?.shares) || 0;
          const avgCost = Number(position?.avgCost) || 0;
          const price = Number(quote?.regularMarketPrice);
          const value = Number.isFinite(price) ? shares * price : 0;
          const cost = shares * avgCost;
          const pnl = value - cost;
          return {
            symbol,
            name: quote?.shortName || symbol,
            price,
            dayChange: quote?.regularMarketChangePercent,
            shares,
            value,
            pnl,
            pnlPercent: cost > 0 ? (pnl / cost) * 100 : 0
          };
        })
      );

  return rows.filter((row) => row.symbol && row.shares > 0 && row.value > 0);
}

function portfolioHealth() {
  const rows = healthRows();
  const totals = isRealMode() ? portfolioTotals(Object.keys(state.realPositions)) : accountTotals();
  const holdings = isRealMode() ? totals.value : totals.holdings;
  const equity = isRealMode() ? holdings : totals.equity;
  const best = rows.reduce((winner, row) => (!winner || row.pnlPercent > winner.pnlPercent ? row : winner), null);
  const worst = rows.reduce((loser, row) => (!loser || row.pnlPercent < loser.pnlPercent ? row : loser), null);
  const largest = rows.reduce((leader, row) => (!leader || row.value > leader.value ? row : leader), null);
  const concentration = holdings > 0 && largest ? (largest.value / holdings) * 100 : 0;
  const dayWeightedValue = rows.reduce((sum, row) => {
    const change = Number(row.dayChange);
    return Number.isFinite(change) ? sum + row.value * (change / 100) : sum;
  }, 0);
  const dayChangePercent = holdings > 0 ? (dayWeightedValue / holdings) * 100 : 0;
  const cashRatio = !isRealMode() && equity > 0 ? (state.cash / equity) * 100 : null;

  return { rows, best, worst, largest, concentration, dayWeightedValue, dayChangePercent, cashRatio, holdings, equity };
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
    renderMobileNav();
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
  renderMobileNav();
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

function comparisonLabel() {
  const amount = Math.max(1, Number(state.comparisonAmount) || 4);
  return `${amount} ${state.comparisonUnit}`;
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

async function getJsonAuth(url) {
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${state.session?.access_token || ""}`
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `Request failed: ${response.status}`);
  }
  return body;
}

async function postJson(url, payload, { auth = false } = {}) {
  const headers = { "content-type": "application/json" };
  if (auth && state.session?.access_token) {
    headers.authorization = `Bearer ${state.session.access_token}`;
  }
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `Request failed: ${response.status}`);
  }
  return body;
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

function setApiKeyMessage(message, type = "") {
  elements.apiKeyMessage.textContent = message || "";
  elements.apiKeyMessage.className = `api-key-message ${type}`.trim();
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

async function loadCloudRealPositions(userId) {
  try {
    const [{ data, error }, { data: watchlistData, error: watchlistError }] = await Promise.all([
      state.supabase.from("real_positions").select("symbol, shares, avg_cost").eq("user_id", userId),
      state.supabase.from("real_watchlist").select("symbol").eq("user_id", userId).order("sort_order", { ascending: true })
    ]);
    if (error) throw error;
    if (watchlistError) throw watchlistError;
    state.realPositionsCloudEnabled = true;
    state.realPositions = normalizePortfolio(
      Object.fromEntries(
        (data || [])
          .map((position) => [
            cleanSymbol(position.symbol),
            { shares: Number(position.shares) || 0, avgCost: Number(position.avg_cost) || 0 }
          ])
          .filter(([symbol]) => !state.removedRealSymbols.has(symbol))
      )
    );
    state.realWatchlist = [
      ...new Set((watchlistData || []).map((item) => cleanSymbol(item.symbol)).filter(Boolean))
    ].filter((symbol) => !state.removedRealSymbols.has(symbol));
    try {
      const { data: transactionData, error: transactionError } = await state.supabase
        .from("real_transactions")
        .select("id, symbol, type, shares, price, avg_cost, total, source, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (transactionError) throw transactionError;
      state.realTransactionsCloudEnabled = true;
      state.realTransactions = (transactionData || [])
        .map((transaction) =>
          normalizeRealTransaction({
            id: transaction.id,
            symbol: transaction.symbol,
            type: transaction.type,
            shares: transaction.shares,
            price: transaction.price,
            avgCost: transaction.avg_cost,
            total: transaction.total,
            source: transaction.source,
            createdAt: transaction.created_at ? new Date(transaction.created_at).getTime() : Date.now()
          })
        )
        .filter(Boolean);
    } catch {
      state.realTransactionsCloudEnabled = false;
    }
  } catch {
    state.realPositionsCloudEnabled = false;
    state.realTransactionsCloudEnabled = false;
  }
}

async function loadCloudData() {
  if (!state.supabase || !state.session) return;
  const userId = state.session.user.id;
  const localRealPositions = { ...state.realPositions };
  const localRealWatchlist = [...(state.realWatchlist || [])];
  const localRealTransactions = [...(state.realTransactions || [])];
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
  await loadCloudRealPositions(userId);
  if (state.realTransactionsCloudEnabled && localRealTransactions.length) {
    const cloudIds = new Set((state.realTransactions || []).map((transaction) => transaction.id));
    state.realTransactions = [
      ...(state.realTransactions || []),
      ...localRealTransactions.filter((transaction) => !cloudIds.has(transaction.id))
    ]
      .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
      .slice(0, 200);
  }
  let mergedRealPortfolio = mergeLocalRealPortfolio(localRealPositions, localRealWatchlist);

  if (!account) {
    mergeLocalRealPortfolio(localRealPositions, localRealWatchlist);
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
      await loadCloudRealPositions(userId);
      mergedRealPortfolio = mergeLocalRealPortfolio(localRealPositions, localRealWatchlist) || mergedRealPortfolio;
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
      await loadCloudRealPositions(userId);
      mergedRealPortfolio = mergeLocalRealPortfolio(localRealPositions, localRealWatchlist) || mergedRealPortfolio;
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
    ensurePositionSymbolsVisible();
    await loadCloudRealPositions(userId);
    mergedRealPortfolio = mergeLocalRealPortfolio(localRealPositions, localRealWatchlist) || mergedRealPortfolio;

    state.activeGroupId = state.groups[0]?.id || "main";
    state.selected = currentSymbols()[0] || null;
  }

  state.cloudReady = true;
  if (mergedRealPortfolio) {
    await saveCloudData({ force: true });
  }
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

  if (state.realPositionsCloudEnabled) {
    await saveResult(state.supabase.from("real_positions").delete().eq("user_id", userId));
    await saveResult(state.supabase.from("real_watchlist").delete().eq("user_id", userId));
    const realPositions = Object.entries(state.realPositions || {})
      .map(([symbol, position]) => {
        const shares = Number(position?.shares) || 0;
        const avgCost = Number(position?.avgCost) || 0;
        return shares > 0 ? { user_id: userId, symbol: cleanSymbol(symbol), shares, avg_cost: avgCost } : null;
      })
      .filter(Boolean);
    if (realPositions.length) {
      await saveResult(state.supabase.from("real_positions").insert(realPositions));
    }
    const ownedSymbols = new Set(Object.keys(state.realPositions || {}));
    const realWatchlist = (state.realWatchlist || [])
      .map(cleanSymbol)
      .filter((symbol) => symbol && !ownedSymbols.has(symbol))
      .map((symbol, index) => ({ user_id: userId, symbol, sort_order: index }));
    if (realWatchlist.length) {
      await saveResult(state.supabase.from("real_watchlist").insert(realWatchlist));
    }
    if (state.realTransactionsCloudEnabled) {
      await saveResult(state.supabase.from("real_transactions").delete().eq("user_id", userId));
      const realTransactions = (state.realTransactions || [])
        .map((transaction) => ({
          id: transaction.id,
          user_id: userId,
          symbol: cleanSymbol(transaction.symbol),
          type: transaction.type,
          shares: Number(transaction.shares) || 0,
          price: Number(transaction.price) || 0,
          avg_cost: Number(transaction.avgCost) || 0,
          total: Number(transaction.total) || 0,
          source: transaction.source || null,
          created_at: new Date(transaction.createdAt || Date.now()).toISOString()
        }))
        .filter((transaction) => transaction.symbol && ["set", "buy", "sell"].includes(transaction.type));
      if (realTransactions.length) {
        await saveResult(state.supabase.from("real_transactions").insert(realTransactions));
      }
    }
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

function renderApiKeys(keys = []) {
  if (!keys.length) {
    elements.apiKeyList.innerHTML = `<div class="empty-state">No Claude paper keys yet.</div>`;
    return;
  }

  elements.apiKeyList.innerHTML = keys
    .map((key) => {
      const isActive = key.status === "active";
      const lastUsed = key.last_used_at ? new Date(key.last_used_at).toLocaleString() : "Never used";
      return `
        <div class="api-key-row ${isActive ? "" : "revoked"}">
          <div>
            <strong>${escapeHtml(key.name || "Claude paper key")}</strong>
            <small>${escapeHtml(key.key_prefix)} | ${escapeHtml(key.status)} | Last used: ${escapeHtml(lastUsed)}</small>
          </div>
          ${
            isActive
              ? `<button type="button" data-api-key-revoke="${escapeHtml(key.id)}">Revoke</button>`
              : ""
          }
        </div>
      `;
    })
    .join("");
}

async function loadApiKeys() {
  if (!state.session?.access_token) return;
  try {
    const data = await getJsonAuth("/api/keys");
    renderApiKeys(data.keys || []);
  } catch (error) {
    setApiKeyMessage(error.message, "error");
  }
}

async function syncPaperAccount({ quiet = true } = {}) {
  if (!state.session?.access_token || state.paperSyncing) return;
  state.paperSyncing = true;

  try {
    const data = await getJsonAuth("/api/paper/account");
    const firstGroup = state.groups[0] || activeGroup();
    let changed = false;

    state.cash = Number(data.account?.cash) || state.cash;
    state.realizedPnl = Number(data.account?.realizedPnl) || 0;
    const nextPaperTransactions = paperTransactionsFromTrades(data.trades || []);
    if (nextPaperTransactions.length) {
      const previousIds = (state.paperTransactions || []).map((transaction) => transaction.id).join("|");
      const nextIds = nextPaperTransactions.map((transaction) => transaction.id).join("|");
      if (previousIds !== nextIds) {
        state.paperTransactions = nextPaperTransactions;
        changed = true;
      }
    }
    firstGroup.portfolio ||= {};
    firstGroup.symbols ||= [];
    const firstBuyBySymbol = new Map();
    (data.trades || []).forEach((trade) => {
      if (String(trade.side).toLowerCase() !== "buy") return;
      const symbol = cleanSymbol(trade.symbol);
      const time = Date.parse(trade.created_at);
      if (!symbol || !Number.isFinite(time)) return;
      const current = firstBuyBySymbol.get(symbol);
      if (!current || time < current) firstBuyBySymbol.set(symbol, time);
    });

    (data.positions || []).forEach((position) => {
      const symbol = cleanSymbol(position.symbol);
      const shares = Number(position.shares) || 0;
      if (!symbol || shares <= 0) return;

      const existing = firstGroup.portfolio[symbol] || {};
      if (!firstGroup.symbols.includes(symbol)) {
        firstGroup.symbols = [symbol, ...firstGroup.symbols];
        changed = true;
      }
      if (Number(existing.shares) !== shares || Number(existing.avgCost) !== Number(position.avgCost)) {
        firstGroup.portfolio[symbol] = {
          shares,
          avgCost: Number(position.avgCost) || 0,
          openedAt: existing.openedAt || firstBuyBySymbol.get(symbol) || Number(position.openedAt) || null
        };
        changed = true;
      }
    });

    if (changed) {
      saveGroups();
      renderWatchlist();
      renderSelectedQuote();
      await refreshQuotes({ quiet: true });
      if (!quiet) elements.marketStatus.textContent = "Paper account synced";
    } else {
      renderAccountSummary();
      renderPortfolioSummary();
      renderTradeHistoryPanels();
    }
  } catch (error) {
    if (!quiet) elements.marketStatus.textContent = `Paper sync failed: ${error.message}`;
  } finally {
    state.paperSyncing = false;
  }
}

function clearSignedOutState(message = "Signed out.") {
  state.session = null;
  state.cloudReady = false;
  state.cloudSaving = false;
  state.cloudSaveQueued = false;
  elements.apiKeyList.innerHTML = "";
  elements.apiKeySecret.hidden = true;
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
  state.paperApiKeysEnabled = Boolean(config.paperApiKeysEnabled);
  elements.apiKeyCreate.disabled = !state.paperApiKeysEnabled;
  if (!state.paperApiKeysEnabled) {
    setApiKeyMessage("Add SUPABASE_SERVICE_ROLE_KEY on the server to enable Claude paper API keys.", "error");
  }
  const { data, error } = await state.supabase.auth.getSession();
  if (error) {
    setAuthMessage(error.message, "error");
  }
  state.session = data?.session || null;
  renderAuthState();
  if (state.session) {
    await loadCloudData();
    await loadApiKeys();
    await syncPaperAccount({ quiet: true });
    await refreshQuotes();
    if (state.selected) refreshNews(state.selected);
  }

  state.supabase.auth.onAuthStateChange(async (_event, session) => {
    state.session = session;
    state.cloudReady = false;
    renderAuthState();
    if (session) {
      await loadCloudData();
      await loadApiKeys();
      await syncPaperAccount({ quiet: true });
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
    if (!requested || !resolved || requested === resolved) return;

    if (isRealMode()) {
      if (state.realPositions[requested]) {
        if (!state.realPositions[resolved]) state.realPositions[resolved] = state.realPositions[requested];
        delete state.realPositions[requested];
      } else if (state.realWatchlist.includes(requested)) {
        state.realWatchlist = state.realWatchlist.map((symbol) => (symbol === requested ? resolved : symbol));
        state.realWatchlist = [...new Set(state.realWatchlist)];
      } else {
        return;
      }
      state.quotes.delete(requested);
      if (state.selected === requested) state.selected = resolved;
      changed = true;
      return;
    }

    if (!group.symbols.includes(requested)) return;

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
    if (isPaperMode()) group.symbols = [...new Set(group.symbols)];
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

  if (isRealMode()) {
    const beforeCount = Object.keys(state.realPositions).length + state.realWatchlist.length;
    invalidSymbols.forEach((symbol) => {
      delete state.realPositions[symbol];
      state.realWatchlist = state.realWatchlist.filter((item) => item !== symbol);
      state.quotes.delete(symbol);
    });
    if (invalidSymbols.has(state.selected)) {
      state.selected = currentSymbols()[0] || null;
    }
    const changed = Object.keys(state.realPositions).length + state.realWatchlist.length !== beforeCount;
    if (changed) saveGroups();
    return changed;
  }

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

function quoteReliabilityText(data) {
  const reliability = data?.reliability || {};
  const parts = [];
  if (reliability.live) parts.push(`${reliability.live} live`);
  if (reliability.cached) parts.push(`${reliability.cached} cached`);
  if (reliability.stale) parts.push(`${reliability.stale} stale`);
  if (reliability.demo) parts.push(`${reliability.demo} demo`);
  return parts.length ? parts.join(" / ") : "";
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
    const removedInvalids = quiet ? false : removeInvalidSymbols(data.invalids || []);
    if (!quiet && data.invalids?.length) {
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
          : `Market prices from Yahoo Finance chart feed${quoteReliabilityText(data) ? ` (${quoteReliabilityText(data)})` : ""}`;
      }
    } else if (data.source === "cached") {
      elements.marketStatus.textContent = `Quotes served from short cache (${quoteReliabilityText(data)})`;
    } else if (data.source === "mixed") {
      elements.marketStatus.textContent = `${data.warning || "Some prices refreshed; some are cached or fallback values"}${
        quoteReliabilityText(data) ? ` (${quoteReliabilityText(data)})` : ""
      }`;
    } else {
      elements.marketStatus.textContent = "Demo prices shown because live market data is unreachable";
    }
    elements.lastUpdated.textContent = `Last update: ${new Date().toLocaleTimeString()}${
      quoteReliabilityText(data) ? ` | ${quoteReliabilityText(data)}` : ""
    }`;
    renderWatchlist();
    renderSelectedQuote();
    if (!state.performance.size) {
      refreshPerformance({ quiet: true });
    }
    if (state.selected) {
      await refreshHistory(state.selected);
    }
  } catch (error) {
    elements.marketStatus.textContent = error.message;
  }
}

async function refreshPerformance({ quiet = false } = {}) {
  const symbols = currentSymbols();
  if (!symbols.length || state.comparisonLoading) {
    renderComparisonTable();
    return;
  }

  state.comparisonLoading = true;
  if (!quiet) elements.comparisonPeriodLabel.textContent = `Loading ${comparisonLabel()}...`;

  const params = new URLSearchParams({
    symbols: symbols.join(","),
    amount: String(state.comparisonAmount),
    unit: state.comparisonUnit
  });
  const heldSince = symbols
    .map((symbol) => {
      const openedAt = positionOpenedAt(symbol);
      return openedAt ? `${symbol}:${Math.floor(openedAt / 1000)}` : null;
    })
    .filter(Boolean);
  if (heldSince.length) params.set("heldSince", heldSince.join(","));

  try {
    const data = await getJson(`/api/performance?${params.toString()}`);
    (data.performance || []).forEach((item) => {
      const symbol = cleanSymbol(item.symbol);
      if (symbol) state.performance.set(symbol, item);
    });
    if (!quiet && data.failed?.length) {
      elements.marketStatus.textContent = `${data.failed.length} performance item${data.failed.length === 1 ? "" : "s"} unavailable`;
    }
  } catch (error) {
    if (!quiet) elements.marketStatus.textContent = `Performance unavailable: ${error.message}`;
  } finally {
    state.comparisonLoading = false;
    renderComparisonTable();
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

function renderComparisonPageVisibility() {
  elements.workspace.hidden = state.comparisonPageOpen;
  elements.comparisonPage.hidden = !state.comparisonPageOpen;
  if (state.comparisonPageOpen) {
    renderComparisonTable();
  }
  renderMobileNav();
}

function renderMobileNav() {
  elements.mobileNavButtons.forEach((button) => {
    const target = button.dataset.mobileNav;
    const active =
      (target === "table" && state.comparisonPageOpen) ||
      (!state.comparisonPageOpen && target === state.portfolioMode);
    button.classList.toggle("active", active);
    button.classList.toggle("has-alerts", target === "alerts" && state.alertEvents.length > 0);
  });

  if (elements.mobileAlertCount) {
    elements.mobileAlertCount.hidden = !state.alertEvents.length;
    elements.mobileAlertCount.textContent = String(state.alertEvents.length);
  }
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

async function executeBrokerTrade(symbol, action, quantity) {
  const qty = Math.max(0, Number(quantity) || 0);
  if (!qty) {
    elements.marketStatus.textContent = "Enter a share amount after the quote loads";
    return false;
  }

  const data = await postJson(
    "/api/paper/trade",
    {
      symbol,
      side: action,
      shares: qty
    },
    { auth: true }
  );

  state.cash = data.account.cash;
  state.realizedPnl = data.account.realizedPnl;
  state.quotes.set(data.quote.symbol, data.quote);

  const group = activeGroup();
  if (!group.symbols.includes(data.quote.symbol)) {
    group.symbols = [data.quote.symbol, ...group.symbols].slice(0, 20);
  }
  group.portfolio ||= {};
  const existing = group.portfolio[data.quote.symbol] || {};
  group.portfolio[data.quote.symbol] = {
    shares: data.position.shares,
    avgCost: data.position.avgCost,
    openedAt: existing.openedAt || Date.now()
  };
  if (state.selected === symbol) {
    state.selected = data.quote.symbol;
  }
  recordPaperTransaction({
    type: action,
    symbol: data.quote.symbol,
    shares: qty,
    price: data.trade.price,
    total: qty * data.trade.price,
    realizedPnl: data.trade.realizedPnl,
    source: "paper-broker"
  });
  saveGroups();
  renderWatchlist();
  renderSelectedQuote();
  elements.marketStatus.textContent =
    action === "buy"
      ? `Bought ${qty} ${data.quote.symbol} at ${moneyAxis(data.trade.price)}`
      : `Sold ${qty} ${data.quote.symbol} at ${moneyAxis(data.trade.price)} (${signedMoney(data.trade.realizedPnl)} realized)`;
  return true;
}

function executeLocalTrade(symbol, action, quantity) {
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
    if (!position.shares) position.openedAt = Date.now();
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
      position.openedAt = null;
    }
    elements.marketStatus.textContent = `Sold ${qty} ${symbol} at ${moneyAxis(price)} (${signedMoney(realized)} realized)`;
  }

  state.cash = Math.max(0, Number(state.cash.toFixed(2)));
  state.realizedPnl = Number(state.realizedPnl.toFixed(2));
  position.shares = Math.max(0, Number(position.shares.toFixed(6)));
  position.avgCost = Math.max(0, Number(position.avgCost.toFixed(4)));
  recordPaperTransaction({
    type: action,
    symbol,
    shares: qty,
    price,
    total: qty * price,
    realizedPnl: tradeRealizedPnl,
    source: "paper-local"
  });
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

async function executeTrade(symbol, action, quantity) {
  if (state.session?.access_token) {
    try {
      await executeBrokerTrade(symbol, action, quantity);
      return;
    } catch (error) {
      elements.marketStatus.textContent = `Paper broker failed: ${error.message}`;
      return;
    }
  }

  executeLocalTrade(symbol, action, quantity);
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
  if (isRealMode()) {
    elements.groupTabs.innerHTML = `
      <button type="button" class="group-tab ${state.activeRealTab === "owned" ? "active" : ""}" data-real-tab="owned">
        <span>Own stock</span>
        <small>${Object.keys(state.realPositions).length}</small>
      </button>
      <button type="button" class="group-tab ${state.activeRealTab === "watchlist" ? "active" : ""}" data-real-tab="watchlist">
        <span>Watch list</span>
        <small>${state.realWatchlist.length}</small>
      </button>
    `;
    return;
  }

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
  const totals = portfolioTotals(isRealMode() ? Object.keys(state.realPositions) : currentSymbols());
  const pnlClass = totals.pnl >= 0 ? "up" : "down";
  const pnlPercent = totals.cost > 0 ? (totals.pnl / totals.cost) * 100 : 0;

  elements.portfolioSummary.innerHTML = isRealMode()
    ? `
    <div>
      <span>Real holdings</span>
      <strong>${money(totals.value)}</strong>
    </div>
    <div>
      <span>Cost basis</span>
      <strong>${money(totals.cost)}</strong>
    </div>
    <div>
      <span>Unrealized P/L</span>
      <strong class="${pnlClass}">${signedMoney(totals.pnl)} (${signed(pnlPercent, "%")})</strong>
    </div>
  `
    : `
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
  renderTradeHistoryPanels();
}

function renderPortfolioHealth() {
  if (!elements.portfolioHealth) return;
  const health = portfolioHealth();
  const dayClass = health.dayWeightedValue >= 0 ? "up" : "down";
  const concentrationClass = health.concentration >= 35 ? "down" : health.concentration >= 20 ? "warn" : "up";
  const cashLabel =
    health.cashRatio === null
      ? `${health.rows.length} owned`
      : `${Number(health.cashRatio).toFixed(1)}% cash`;

  if (!health.rows.length) {
    elements.portfolioHealth.innerHTML = `
      <div class="health-card wide">
        <span>Portfolio health</span>
        <strong>Add owned shares to unlock health signals.</strong>
      </div>
    `;
    return;
  }

  elements.portfolioHealth.innerHTML = `
    <div class="health-card">
      <span>Biggest winner</span>
      <strong class="${health.best?.pnl >= 0 ? "up" : "down"}">${escapeHtml(health.best?.symbol || "--")}</strong>
      <small>${signedMoney(health.best?.pnl)} (${signed(health.best?.pnlPercent, "%")})</small>
    </div>
    <div class="health-card">
      <span>Biggest loser</span>
      <strong class="${health.worst?.pnl >= 0 ? "up" : "down"}">${escapeHtml(health.worst?.symbol || "--")}</strong>
      <small>${signedMoney(health.worst?.pnl)} (${signed(health.worst?.pnlPercent, "%")})</small>
    </div>
    <div class="health-card">
      <span>Today estimate</span>
      <strong class="${dayClass}">${signedMoney(health.dayWeightedValue)}</strong>
      <small>${signed(health.dayChangePercent, "%")} weighted move</small>
    </div>
    <div class="health-card">
      <span>Largest position</span>
      <strong class="${concentrationClass}">${escapeHtml(health.largest?.symbol || "--")}</strong>
      <small>${signed(health.concentration, "%").replace("+", "")} of holdings</small>
    </div>
    <div class="health-card">
      <span>${isRealMode() ? "Real exposure" : "Cash balance"}</span>
      <strong>${escapeHtml(cashLabel)}</strong>
      <small>${money(health.holdings)} invested</small>
    </div>
  `;
}

function tradeHistoryMarkup(transactions, modeLabel, options = {}) {
  const canClearHistory = options.canClear !== false;
  return `
    <div class="history-head">
      <span>Recent ${modeLabel} trades</span>
      <button type="button" data-action="${escapeHtml(options.clearAction || "clear-trade-history")}" ${
        transactions.length && canClearHistory ? "" : "disabled"
      }>Clear</button>
    </div>
    ${
      transactions.length
        ? `<div class="history-list">
            ${transactions
              .map((transaction) => {
                const typeLabel =
                  transaction.type === "set" ? "Set position" : transaction.type === "buy" ? "Buy" : "Sell";
                const priceLabel = transaction.type === "set" ? money(transaction.avgCost) : money(transaction.price);
                const totalLabel = money(transaction.total);
                const realizedLabel =
                  modeLabel === "paper" && transaction.type === "sell"
                    ? ` | Realized ${signedMoney(transaction.realizedPnl)}`
                    : "";
                return `
                  <div class="history-row">
                    <div>
                      <strong>${escapeHtml(transaction.symbol)}</strong>
                      <span>${escapeHtml(typeLabel)} | ${new Date(transaction.createdAt).toLocaleString()}</span>
                    </div>
                    <div>
                      <strong>${Number(transaction.shares).toLocaleString(undefined, { maximumFractionDigits: 4 })}</strong>
                      <span>${priceLabel} | ${totalLabel}${realizedLabel}</span>
                    </div>
                  </div>
                `;
              })
              .join("")}
          </div>`
        : `<div class="empty-state mini">No ${modeLabel} trades recorded yet.</div>`
    }
  `;
}

function renderTradeHistoryPanels() {
  if (!elements.paperTradeHistory || !elements.realTradeHistory) return;

  const paperTransactions = (state.paperTransactions || []).slice(0, 8);
  const realTransactions = (state.realTransactions || []).slice(0, 8);
  elements.paperTradeHistory.hidden = isRealMode();
  elements.realTradeHistory.hidden = !isRealMode();
  elements.paperTradeHistory.innerHTML = tradeHistoryMarkup(paperTransactions, "paper", {
    clearAction: "clear-paper-history",
    canClear: !state.session?.access_token
  });
  elements.realTradeHistory.innerHTML = tradeHistoryMarkup(realTransactions, "real", {
    clearAction: "clear-real-history"
  });
}

function renderAccountSummary() {
  renderPortfolioMode();
  if (isRealMode()) {
    const totals = portfolioTotals(Object.keys(state.realPositions));
    const pnlClass = totals.pnl >= 0 ? "up" : "down";
    const pnlPercent = totals.cost > 0 ? (totals.pnl / totals.cost) * 100 : 0;
    elements.accountSummary.innerHTML = `
      <div>
        <span>Real portfolio value</span>
        <strong>${money(totals.value)}</strong>
      </div>
      <div>
        <span>Cost basis</span>
        <strong>${money(totals.cost)}</strong>
      </div>
      <div>
        <span>Unrealized P/L</span>
        <strong class="${pnlClass}">${signedMoney(totals.pnl)} (${signed(pnlPercent, "%")})</strong>
      </div>
      <div>
        <span>Positions</span>
        <strong>${currentSymbols().length}</strong>
      </div>
    `;
    return;
  }

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

function renderPortfolioMode() {
  elements.portfolioModeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.portfolioMode === state.portfolioMode);
  });
  elements.apiKeyPanel.hidden = isRealMode();
  elements.form.hidden = isRealOwnedTab();
  elements.realPositionForm.hidden = !isRealOwnedTab();
  elements.groupTabs.hidden = false;
  elements.groupLabel.hidden = false;
  elements.groupLabel.textContent = isRealMode() ? "Real portfolio" : "Groups";
  elements.input.placeholder = isRealWatchlistTab() ? "TSLA" : "AAPL";
  elements.watchlistAddTitle.textContent = isRealOwnedTab()
    ? "Add or update owned stock"
    : isRealWatchlistTab()
      ? "Add stock to real watch list"
    : "Add stock to selected group";
  elements.stockSearch.placeholder = isRealMode() ? "Search real stocks" : "Search group stocks";
  renderMobileNav();
}

function comparisonRows() {
  return currentSymbols().map((symbol) => {
    const quote = state.quotes.get(symbol);
    const stats = positionStats(symbol);
    const performance = state.performance.get(symbol);
    const performanceLabel = performance?.effectiveLabel || "";
    return {
      symbol,
      price: quote?.regularMarketPrice,
      dayChange: quote?.regularMarketChangePercent,
      performance: performance?.changePercent,
      performanceLabel,
      shares: stats.shares,
      value: stats.value,
      pnl: stats.pnl,
      pnlPercent: stats.pnlPercent
    };
  });
}

function renderComparisonTable() {
  elements.comparisonAmount.value = state.comparisonAmount;
  elements.comparisonUnit.value = state.comparisonUnit;
  elements.comparisonSort.value = state.comparisonSort;
  elements.comparisonPeriodLabel.textContent = `${comparisonLabel()} performance`;

  const rows = comparisonRows();
  if (!rows.length) {
    elements.comparisonTable.innerHTML = `<div class="empty-state mini">Add stocks to compare them.</div>`;
    return;
  }

  const sortKey = state.comparisonSort;
  rows.sort((a, b) => {
    const direction = state.comparisonSortDirection === "asc" ? 1 : -1;
    if (sortKey === "symbol") return a.symbol.localeCompare(b.symbol) * direction;
    const aValue = Number(a[sortKey]);
    const bValue = Number(b[sortKey]);
    const sorted =
      (Number.isFinite(aValue) ? aValue : -Infinity) - (Number.isFinite(bValue) ? bValue : -Infinity);
    return sorted * direction;
  });
  const sortMark = (key) =>
    state.comparisonSort === key ? `<span aria-hidden="true">${state.comparisonSortDirection === "asc" ? "▲" : "▼"}</span>` : "";

  elements.comparisonTable.innerHTML = `
    <table>
      <thead>
        <tr>
          <th><button type="button" data-sort-key="symbol">Symbol ${sortMark("symbol")}</button></th>
          <th><button type="button" data-sort-key="price">Price ${sortMark("price")}</button></th>
          <th><button type="button" data-sort-key="dayChange">Day ${sortMark("dayChange")}</button></th>
          <th><button type="button" data-sort-key="performance">${escapeHtml(comparisonLabel())} ${sortMark("performance")}</button></th>
          <th><button type="button" data-sort-key="shares">Shares ${sortMark("shares")}</button></th>
          <th><button type="button" data-sort-key="value">Value ${sortMark("value")}</button></th>
          <th><button type="button" data-sort-key="pnl">P/L ${sortMark("pnl")}</button></th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((row) => {
            const perfClass = (Number(row.performance) || 0) >= 0 ? "up" : "down";
            const pnlClass = (Number(row.pnl) || 0) >= 0 ? "up" : "down";
            return `
              <tr data-symbol="${escapeHtml(row.symbol)}">
                <td><button type="button" data-action="select" data-symbol="${escapeHtml(row.symbol)}">${escapeHtml(row.symbol)}</button></td>
                <td>${money(row.price)}</td>
                <td class="${(Number(row.dayChange) || 0) >= 0 ? "up" : "down"}">${signed(row.dayChange, "%")}</td>
                <td class="${perfClass}">${signed(row.performance, "%")}${
                  row.performanceLabel ? ` <small>(${escapeHtml(row.performanceLabel)})</small>` : ""
                }</td>
                <td>${row.shares ? row.shares.toLocaleString() : "--"}</td>
                <td>${money(row.value)}</td>
                <td class="${pnlClass}">${signedMoney(row.pnl)}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function resetPaperAccount() {
  state.cash = STARTING_CASH;
  state.realizedPnl = 0;
  state.paperTransactions = [];
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
  const visibleSymbols = visibleStockSymbols(symbols);
  renderGroups();
  renderAccountSummary();
  renderPortfolioSummary();
  renderPortfolioHealth();
  renderComparisonTable();
  if (elements.stockSearch.value !== state.stockSearch) {
    elements.stockSearch.value = state.stockSearch;
  }

  if (!symbols.length) {
    elements.stockList.innerHTML = `<div class="empty-state">${
      isRealMode()
        ? isRealOwnedTab()
          ? "Add your first real holding with shares and average cost."
          : "Add your first real watchlist stock."
        : `Add a ticker symbol to ${escapeHtml(group.name)}.`
    }</div>`;
    return;
  }

  if (!visibleSymbols.length) {
    elements.stockList.innerHTML = `<div class="empty-state">No stocks match "${escapeHtml(state.stockSearch.trim())}".</div>`;
    return;
  }

  elements.stockList.innerHTML = visibleSymbols
    .map((symbol) => {
      const quote = state.quotes.get(symbol);
      const change = quote?.regularMarketChange;
      const changePercent = quote?.regularMarketChangePercent;
      const direction = change >= 0 ? "up" : "down";
      const marketState = quote?.marketState || "WAIT";
      const stats = positionStats(symbol);
      const ownedShares = Number(stats.shares) || 0;
      const ownedShareLabel = ownedShares.toLocaleString(undefined, { maximumFractionDigits: 4 });
      const pnlDirection = stats.pnl >= 0 ? "up" : "down";
      const alert = isPaperMode() ? alertFor(symbol) : { active: false, direction: "above", target: 0 };
      const status = isPaperMode() ? alertStatus(symbol) : { triggered: false, label: "No alert", className: "" };
      const isSelected = state.selected === symbol;

      return `
        <article class="stock-card ${isSelected ? "active expanded" : "compact"} ${
          status.triggered ? "alert-hit" : ""
        }" data-symbol="${symbol}" draggable="${isPaperMode()}">
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
          <div class="quantity-label">
            <span>Shares</span>
            <strong>${ownedShareLabel}</strong>
          </div>
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
                ${
                  isPaperMode()
                    ? `
                <div class="trade-editor">
                  <label>
                    <span>Paper trade</span>
                    <input type="number" min="0" step="0.0001" inputmode="decimal" data-trade-qty data-symbol="${symbol}" placeholder="Shares" />
                  </label>
                  <button type="button" data-trade-action="buy" data-symbol="${symbol}">Buy</button>
                  <button type="button" data-trade-action="sell" data-symbol="${symbol}">Sell</button>
                </div>
                    `
                    : `
                <div class="real-editor">
                  <div class="real-editor-section">
                    <strong>Current position</strong>
                    <label>
                      <span>Shares</span>
                      <input type="number" min="0" step="0.0001" inputmode="decimal" data-real-field="shares" data-symbol="${symbol}" value="${stats.shares || ""}" />
                    </label>
                    <label>
                      <span>Average cost</span>
                      <input type="number" min="0" step="0.01" inputmode="decimal" data-real-field="avgCost" data-symbol="${symbol}" value="${stats.avgCost || ""}" />
                    </label>
                    <button type="button" data-real-action="save" data-symbol="${symbol}">Set</button>
                  </div>
                  <div class="real-editor-section">
                    <strong>Real trade</strong>
                    <label>
                      <span>Shares</span>
                      <input type="number" min="0" step="0.0001" inputmode="decimal" data-real-trade-qty data-symbol="${symbol}" placeholder="Shares" />
                    </label>
                    <label>
                      <span>Price</span>
                      <input type="number" min="0" step="0.01" inputmode="decimal" data-real-trade-price data-symbol="${symbol}" value="${
                        Number.isFinite(quote?.regularMarketPrice) ? Number(quote.regularMarketPrice).toFixed(2) : ""
                      }" placeholder="Price" />
                    </label>
                    <button type="button" data-real-trade-action="buy" data-symbol="${symbol}">Buy</button>
                    <button type="button" data-real-trade-action="sell" data-symbol="${symbol}">Sell</button>
                  </div>
                </div>
                    `
                }
                ${
                  isPaperMode()
                    ? `
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
  const dataAge = Number.isFinite(Number(quote.dataAgeSeconds)) ? ` | age ${Number(quote.dataAgeSeconds)}s` : "";
  const cacheStatus = quote.cacheStatus && quote.cacheStatus !== "fresh" ? ` | ${quote.cacheStatus}` : "";
  elements.selectedChange.textContent = `${signed(change)} (${signed(quote.regularMarketChangePercent, "%")}) | Vol ${compact(
    quote.regularMarketVolume
  )} | ${quote.marketState || "DATA"} | ${marketTime}${cacheStatus}${dataAge}`;
  elements.selectedChange.className = direction;
  const stats = positionStats(quote.symbol);
  const pnlDirection = stats.pnl >= 0 ? "up" : "down";
  const selectedAlert = isPaperMode() ? alertFor(quote.symbol) : { active: false };
  const selectedAlertStatus = isPaperMode() ? alertStatus(quote.symbol) : { label: "--", className: "" };
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
      <span>${isRealMode() ? "Portfolio" : "Price alert"}</span>
      <strong class="${selectedAlertStatus.className === "triggered" ? "down" : ""}">${
        isRealMode() ? "Real tracker" : selectedAlert.active ? selectedAlertStatus.label : "--"
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
  if (isRealMode()) return;
  const group = activeGroup();
  const orderedSymbols = [...elements.stockList.querySelectorAll(".stock-card")]
    .map((card) => cleanSymbol(card.dataset.symbol))
    .filter(Boolean);

  if (orderedSymbols.length !== group.symbols.length) return;
  group.symbols = orderedSymbols;
  saveGroups();
  renderWatchlist();
}

async function addOrUpdateRealPosition(symbol, shares, avgCost) {
  const cleaned = cleanSymbol(symbol);
  const positionShares = Math.max(0, Number(shares) || 0);
  const positionAvgCost = Math.max(0, Number(avgCost) || 0);
  if (!cleaned || positionShares <= 0) {
    setAddStockMessage("Enter a valid stock symbol and share count.", "error");
    return;
  }

  setAddStockMessage(`Checking ${cleaned}...`);
  const quote = await lookupStockBeforeAdd(cleaned);
  if (!quote) return;

  const resolvedSymbol = cleanSymbol(quote.symbol);
  const existing = state.realPositions[resolvedSymbol] || {};
  state.removedRealSymbols.delete(resolvedSymbol);
  state.realPositions[resolvedSymbol] = {
    shares: positionShares,
    avgCost: positionAvgCost,
    openedAt: existing.openedAt || Date.now()
  };
  recordRealTransaction({
    type: "set",
    symbol: resolvedSymbol,
    shares: positionShares,
    avgCost: positionAvgCost,
    total: positionShares * positionAvgCost,
    source: "manual"
  });
  state.realWatchlist = state.realWatchlist.filter((item) => item !== resolvedSymbol);
  state.quotes.set(resolvedSymbol, quote);
  state.selected = resolvedSymbol;
  saveGroups();
  renderWatchlist();
  renderSelectedQuote();
  setAddStockMessage(`${resolvedSymbol} real position saved.`, "success");
  await refreshQuotes();
  await refreshNews(resolvedSymbol);
}

async function executeRealTrade(symbol, action, quantity, tradePrice) {
  const cleaned = cleanSymbol(symbol);
  const qty = Math.max(0, Number(quantity) || 0);

  if (!cleaned || !qty) {
    elements.marketStatus.textContent = "Enter real stock symbol and share count";
    return;
  }

  const quote = state.quotes.get(cleaned) || (await lookupStockBeforeAdd(cleaned));
  if (!quote) return;

  const resolvedSymbol = cleanSymbol(quote?.symbol || cleaned);
  const livePrice = Number(quote?.regularMarketPrice);
  const enteredPrice = Number(tradePrice);
  const usingEnteredPrice = Number.isFinite(enteredPrice) && enteredPrice > 0;
  const price = Math.max(0, Number.isFinite(enteredPrice) && enteredPrice > 0 ? enteredPrice : livePrice);
  if (!price) {
    elements.marketStatus.textContent = `Live price is not available for ${resolvedSymbol}`;
    return;
  }

  const position = state.realPositions[resolvedSymbol] || { shares: 0, avgCost: 0, openedAt: null };

  if (action === "buy") {
    state.removedRealSymbols.delete(resolvedSymbol);
    const existingCost = Number(position.shares) * Number(position.avgCost);
    const addedCost = qty * price;
    position.shares = Math.max(0, Number(position.shares) || 0) + qty;
    position.avgCost = position.shares ? (existingCost + addedCost) / position.shares : 0;
    position.openedAt ||= Date.now();
    state.realPositions[resolvedSymbol] = {
      shares: Number(position.shares.toFixed(6)),
      avgCost: Number(position.avgCost.toFixed(4)),
      openedAt: position.openedAt
    };
    recordRealTransaction({
      type: "buy",
      symbol: resolvedSymbol,
      shares: qty,
      price,
      total: qty * price,
      source: usingEnteredPrice ? "entered" : "live"
    });
    state.realWatchlist = state.realWatchlist.filter((item) => item !== resolvedSymbol);
    state.activeRealTab = "owned";
    localStorage.setItem(REAL_ACTIVE_TAB_KEY, state.activeRealTab);
    elements.marketStatus.textContent = `Bought ${qty} real ${resolvedSymbol} at ${moneyAxis(price)}`;
  } else {
    const currentShares = Number(position.shares) || 0;
    if (qty > currentShares) {
      elements.marketStatus.textContent = `You only have ${currentShares.toLocaleString()} real ${resolvedSymbol} shares`;
      return;
    }
    position.shares = Math.max(0, currentShares - qty);
    if (position.shares <= 0) {
      delete state.realPositions[resolvedSymbol];
      state.selected = currentSymbols()[0] || null;
    } else {
      state.realPositions[resolvedSymbol] = {
        shares: Number(position.shares.toFixed(6)),
        avgCost: Number(position.avgCost.toFixed(4)),
        openedAt: position.openedAt || Date.now()
      };
    }
    recordRealTransaction({
      type: "sell",
      symbol: resolvedSymbol,
      shares: qty,
      price,
      total: qty * price,
      source: usingEnteredPrice ? "entered" : "live"
    });
    elements.marketStatus.textContent = `Sold ${qty} real ${resolvedSymbol} at ${moneyAxis(price)}`;
  }

  if (quote?.symbol) state.quotes.set(resolvedSymbol, quote);
  if (action === "buy") state.selected = resolvedSymbol;
  state.performance.clear();
  saveGroups();
  renderWatchlist();
  renderSelectedQuote();
  setAddStockMessage(
    `${action === "buy" ? "Bought" : "Sold"} ${qty} ${resolvedSymbol} at ${moneyAxis(price)}.`,
    "success"
  );
  refreshPerformance({ quiet: true });
}

function setPortfolioMode(mode) {
  state.portfolioMode = mode === "real" ? "real" : "paper";
  state.comparisonPageOpen = false;
  clearStockSearch();
  state.selected = currentSymbols()[0] || null;
  state.performance.clear();
  saveGroups();
  renderWatchlist();
  renderSelectedQuote();
  refreshPerformance({ quiet: true });
  renderComparisonPageVisibility();
  if (state.selected) {
    refreshHistory(state.selected);
    refreshNews(state.selected);
  }
}

function setRealTab(tab) {
  state.activeRealTab = tab === "watchlist" ? "watchlist" : "owned";
  clearStockSearch();
  state.selected = currentSymbols()[0] || null;
  state.performance.clear();
  saveGroups();
  renderWatchlist();
  renderSelectedQuote();
  refreshPerformance({ quiet: true });
  if (state.selected) {
    refreshQuotes();
    selectStock(state.selected);
  }
}

async function addRealWatchlistSymbol(symbol) {
  const cleaned = cleanSymbol(symbol);
  if (!cleaned) return;
  if (state.realWatchlist.includes(cleaned)) {
    setAddStockMessage(`${cleaned} is already in the real watch list.`, "error");
    return;
  }
  if (state.realPositions[cleaned]) {
    setAddStockMessage(`${cleaned} is already in Own stock.`, "error");
    return;
  }

  setAddStockMessage(`Checking ${cleaned}...`);
  const quote = await lookupStockBeforeAdd(cleaned);
  if (!quote) return;

  const resolvedSymbol = cleanSymbol(quote.symbol);
  if (!state.realWatchlist.includes(resolvedSymbol) && !state.realPositions[resolvedSymbol]) {
    state.removedRealSymbols.delete(resolvedSymbol);
    state.realWatchlist = [resolvedSymbol, ...state.realWatchlist];
  }
  state.quotes.set(resolvedSymbol, quote);
  state.selected = resolvedSymbol;
  saveGroups();
  renderWatchlist();
  renderSelectedQuote();
  setAddStockMessage(`${resolvedSymbol} added to real watch list.`, "success");
  await refreshQuotes();
  await refreshNews(resolvedSymbol);
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (isRealWatchlistTab()) {
    await addRealWatchlistSymbol(elements.input.value);
    elements.input.value = "";
    return;
  }

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

elements.realPositionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const action = event.submitter?.value || "set";
  if (action === "buy-live") {
    await executeRealTrade(elements.realSymbol.value, "buy", elements.realShares.value);
  } else {
    await addOrUpdateRealPosition(
      elements.realSymbol.value,
      elements.realShares.value,
      elements.realAvgCost.value
    );
  }
  elements.realSymbol.value = "";
  elements.realShares.value = "";
  elements.realAvgCost.value = "";
});

elements.portfolioModeButtons.forEach((button) => {
  button.addEventListener("click", () => setPortfolioMode(button.dataset.portfolioMode));
});

elements.mobileNavButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.mobileNav;
    if (target === "paper" || target === "real") {
      setPortfolioMode(target);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (target === "table") {
      state.comparisonPageOpen = true;
      renderComparisonPageVisibility();
      refreshPerformance({ quiet: true });
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (target === "alerts") {
      if (!state.alertEvents.length) {
        elements.marketStatus.textContent = "No active alerts right now";
        document.querySelector(".status-row")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      elements.alertTray.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
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
  const client = state.supabase;
  elements.signOut.disabled = true;
  elements.signOut.textContent = "Signing out...";

  clearSignedOutState();

  try {
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) throw error;
  } catch (error) {
    setAuthMessage(`Signed out locally. ${error.message || "Cloud sign-out did not finish."}`, "success");
  } finally {
    client.auth.signOut().catch(() => {});
    elements.signOut.disabled = false;
    elements.signOut.textContent = "Sign out";
  }
});

elements.groupTabs.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  if (button.dataset.realTab) {
    setRealTab(button.dataset.realTab);
    return;
  }

  if (isRealMode()) return;

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
    clearStockSearch();
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
  clearStockSearch();
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
  if (isRealMode()) return;
  const button = event.target.closest('button[data-action="show-group-input"]');
  if (!button) return;
  event.preventDefault();
  showGroupInput();
});

elements.groupTabs.addEventListener("dblclick", (event) => {
  if (isRealMode()) return;
  const button = event.target.closest("button[data-group-id]");
  if (!button) return;

  state.creatingGroup = false;
  state.renamingGroupId = button.dataset.groupId;
  renderGroups();
  elements.groupTabs.querySelector(".rename-group-tab input")?.focus();
  elements.groupTabs.querySelector(".rename-group-tab input")?.select();
});

elements.groupTabs.addEventListener("submit", async (event) => {
  if (isRealMode()) return;
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
  clearStockSearch();
  state.selected = null;
  saveGroups();
  renderWatchlist();
  renderSelectedQuote();
});

elements.groupTabs.addEventListener("focusout", (event) => {
  if (isRealMode()) return;
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

elements.openComparison.addEventListener("click", () => {
  state.comparisonPageOpen = true;
  renderComparisonPageVisibility();
  if (!state.performance.size) refreshPerformance();
});

elements.backToCards.addEventListener("click", () => {
  state.comparisonPageOpen = false;
  renderComparisonPageVisibility();
});

function applyComparisonControls() {
  const unit = VALID_CUSTOM_UNITS.has(elements.comparisonUnit.value) ? elements.comparisonUnit.value : "days";
  const maxByUnit = { hours: 168, days: 365, months: 60 };
  const amount = Math.min(
    Math.max(Number.parseInt(elements.comparisonAmount.value, 10) || 4, 1),
    maxByUnit[unit]
  );
  const periodChanged = amount !== state.comparisonAmount || unit !== state.comparisonUnit;

  state.comparisonAmount = amount;
  state.comparisonUnit = unit;
  state.comparisonSort = elements.comparisonSort.value;
  state.comparisonSortDirection = "desc";
  localStorage.setItem("stock-dashboard-comparison-amount", String(amount));
  localStorage.setItem("stock-dashboard-comparison-unit", unit);
  localStorage.setItem("stock-dashboard-comparison-sort", state.comparisonSort);
  localStorage.setItem("stock-dashboard-comparison-sort-direction", state.comparisonSortDirection);

  if (periodChanged) state.performance.clear();
  renderComparisonTable();
  if (periodChanged) refreshPerformance();
}

elements.comparisonControls.addEventListener("change", applyComparisonControls);

elements.comparisonControls.addEventListener("submit", (event) => {
  event.preventDefault();
  applyComparisonControls();
});

elements.comparisonRefresh.addEventListener("click", () => {
  state.performance.clear();
  refreshPerformance();
});

elements.accountSummary.addEventListener("click", (event) => {
  if (event.target.closest("#reset-paper-account")) {
    resetPaperAccount();
  }
});

elements.apiKeyCreate.addEventListener("click", async () => {
  if (!state.session?.access_token) return;
  if (!state.paperApiKeysEnabled) {
    setApiKeyMessage("Add SUPABASE_SERVICE_ROLE_KEY on the server to enable Claude paper API keys.", "error");
    return;
  }
  elements.apiKeyCreate.disabled = true;
  setApiKeyMessage("Generating paper API key...");
  try {
    const data = await postJson("/api/keys/create", { name: "Claude paper key" }, { auth: true });
    elements.apiKeySecret.hidden = false;
    elements.apiKeySecret.innerHTML = `
      <strong>Copy this secret now. It will not be shown again.</strong>
      <span>Endpoint</span>
      <code>${escapeHtml(data.credentials.endpoint)}</code>
      <span>Key</span>
      <code>${escapeHtml(data.credentials.key)}</code>
      <span>Secret</span>
      <code>${escapeHtml(data.credentials.secret)}</code>
      <span>Claude can call <code>/api/paper/account</code> and <code>/api/paper/trade</code> with headers <code>X-Poshkan-Key</code> and <code>X-Poshkan-Secret</code>.</span>
    `;
    setApiKeyMessage("Paper API key generated.", "success");
    await loadApiKeys();
  } catch (error) {
    setApiKeyMessage(error.message, "error");
  } finally {
    elements.apiKeyCreate.disabled = false;
  }
});

elements.apiKeyList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-api-key-revoke]");
  if (!button || !state.session?.access_token) return;
  setApiKeyMessage("Revoking key...");
  try {
    await postJson("/api/keys/revoke", { id: button.dataset.apiKeyRevoke }, { auth: true });
    setApiKeyMessage("Paper API key revoked.", "success");
    elements.apiKeySecret.hidden = true;
    await loadApiKeys();
  } catch (error) {
    setApiKeyMessage(error.message, "error");
  }
});

elements.toggleDetails.addEventListener("click", () => setDetailsPanelVisibility(!state.showDetailsPanel));

elements.watchlist.addEventListener("click", (event) => {
  const clearHistoryButton = event.target.closest("[data-action='clear-paper-history'], [data-action='clear-real-history']");
  if (clearHistoryButton) {
    if (clearHistoryButton.dataset.action === "clear-real-history") {
      state.realTransactions = [];
    } else {
      state.paperTransactions = [];
    }
    saveGroups();
    renderPortfolioSummary();
    elements.marketStatus.textContent = `${
      clearHistoryButton.dataset.action === "clear-real-history" ? "Real" : "Paper"
    } transaction history cleared`;
    return;
  }

  const keepSelection = event.target.closest(
    ".stock-card, form, .panel-title, .group-tabs, .portfolio-summary, .trade-history, .stock-search"
  );
  if (!keepSelection) {
    clearSelectedCard();
  }
});

elements.stockSearch.addEventListener("input", () => {
  state.stockSearch = elements.stockSearch.value;
  renderWatchlist();
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
    if (isRealMode()) return;
    const symbol = cleanSymbol(button.dataset.symbol);
    const card = button.closest(".stock-card");
    const qty = card?.querySelector("input[data-trade-qty]")?.value;
    executeTrade(symbol, button.dataset.tradeAction, qty);
    return;
  }

  if (button.dataset.realTradeAction) {
    const symbol = cleanSymbol(button.dataset.symbol);
    const card = button.closest(".stock-card");
    const qty = card?.querySelector("input[data-real-trade-qty]")?.value;
    const price = card?.querySelector("input[data-real-trade-price]")?.value;
    await executeRealTrade(symbol, button.dataset.realTradeAction, qty, price);
    return;
  }

  if (button.dataset.realAction === "save") {
    const symbol = cleanSymbol(button.dataset.symbol);
    const card = button.closest(".stock-card");
    const shares = card?.querySelector('[data-real-field="shares"]')?.value;
    const avgCost = card?.querySelector('[data-real-field="avgCost"]')?.value;
    await addOrUpdateRealPosition(symbol, shares, avgCost);
    return;
  }

  const symbol = button.dataset.symbol;
  if (button.dataset.action === "remove") {
    if (isRealMode()) {
      if (isRealOwnedTab()) {
        state.removedRealSymbols.add(symbol);
        delete state.realPositions[symbol];
      } else {
        state.removedRealSymbols.add(symbol);
        state.realWatchlist = state.realWatchlist.filter((item) => item !== symbol);
      }
      state.quotes.delete(symbol);
      state.selected = currentSymbols()[0] || null;
      saveGroups();
      renderWatchlist();
      renderSelectedQuote();
      if (state.selected) await selectStock(state.selected);
      if (state.cloudReady) await saveCloudData({ force: true });
      return;
    }
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

elements.comparisonTable.addEventListener("click", async (event) => {
  const sortButton = event.target.closest("button[data-sort-key]");
  if (sortButton) {
    const key = sortButton.dataset.sortKey;
    if (state.comparisonSort === key) {
      state.comparisonSortDirection = state.comparisonSortDirection === "desc" ? "asc" : "desc";
    } else {
      state.comparisonSort = key;
      state.comparisonSortDirection = "desc";
    }
    localStorage.setItem("stock-dashboard-comparison-sort", state.comparisonSort);
    localStorage.setItem("stock-dashboard-comparison-sort-direction", state.comparisonSortDirection);
    renderComparisonTable();
    return;
  }

  const button = event.target.closest("button[data-action='select']");
  if (!button) return;
  await selectStock(cleanSymbol(button.dataset.symbol));
  state.comparisonPageOpen = false;
  renderComparisonPageVisibility();
});

elements.stockList.addEventListener("dragstart", (event) => {
  if (isRealMode()) {
    event.preventDefault();
    return;
  }
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
renderComparisonPageVisibility();
state.selected = currentSymbols()[0] || null;
renderPortfolioMode();
setAuthMode("signin");

initializeAuth();

state.timer = window.setInterval(() => {
  if (state.session) refreshQuotes({ quiet: true });
}, state.refreshMs);

state.paperTimer = window.setInterval(() => {
  if (state.session) syncPaperAccount({ quiet: true });
}, state.paperSyncMs);
