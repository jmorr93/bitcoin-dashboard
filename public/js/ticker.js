import { fetchJSON, formatCurrency, formatNumber, formatPercent } from './utils.js';

const COINGECKO_SIMPLE_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true';
const COINGECKO_GLOBAL_URL = 'https://api.coingecko.com/api/v3/global';

const STORAGE_KEY = 'btc_ticker_cache';

export async function updateTicker() {
  const priceEl = document.getElementById('tickerPrice');
  const changeEl = document.getElementById('tickerChange');
  const mcapEl = document.getElementById('tickerMcap');
  const volumeEl = document.getElementById('tickerVolume');
  const dominanceEl = document.getElementById('tickerDominance');
  const updatedEl = document.getElementById('lastUpdated');

  // Render cached data instantly
  const cached = localStorage.getItem(STORAGE_KEY);
  if (cached) {
    try {
      renderTicker(JSON.parse(cached), priceEl, changeEl, mcapEl, volumeEl, dominanceEl);
    } catch (_) {}
  }

  try {
    const [priceData, globalData] = await Promise.all([
      fetchJSON(COINGECKO_SIMPLE_URL),
      fetchJSON(COINGECKO_GLOBAL_URL),
    ]);

    const btc = priceData.bitcoin;
    const dominance = globalData.data?.market_cap_percentage?.btc;

    const tickerState = {
      price: btc.usd,
      change24h: btc.usd_24h_change,
      mcap: btc.usd_market_cap,
      volume: btc.usd_24h_vol,
      dominance,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(tickerState));
    renderTicker(tickerState, priceEl, changeEl, mcapEl, volumeEl, dominanceEl);

    updatedEl.textContent = 'Updated ' + new Date().toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });

    return tickerState;
  } catch (err) {
    console.error('Ticker fetch failed:', err);
    return null;
  }
}

function renderTicker(state, priceEl, changeEl, mcapEl, volumeEl, dominanceEl) {
  priceEl.textContent = formatCurrency(state.price);

  const isPositive = state.change24h >= 0;
  changeEl.textContent = formatPercent(state.change24h);
  changeEl.className = 'ticker-change ' + (isPositive ? 'positive' : 'negative');

  mcapEl.textContent = formatCurrency(state.mcap, true);
  volumeEl.textContent = formatCurrency(state.volume, true);
  dominanceEl.textContent = state.dominance != null ? state.dominance.toFixed(1) + '%' : '--';
}
