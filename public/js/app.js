import { initChart, loadPriceData } from './chart.js';
import { updateTicker } from './ticker.js';
import { initRangeSelector } from './range-selector.js';
import { toggleComparison, toggleNormalize } from './comparison.js';
import { loadTweets } from './tweets.js';
import { loadNews, initNewsTabs } from './news.js';

async function init() {
  // Initialize chart
  const chartTarget = document.getElementById('chartTarget');
  initChart(chartTarget);

  // Initialize controls
  initRangeSelector();
  initNewsTabs();

  // Comparison button handlers
  document.getElementById('comparisonButtons').addEventListener('click', (e) => {
    const btn = e.target.closest('.comparison-btn');
    if (btn) toggleComparison(btn.dataset.mode);
  });

  // Normalize toggle
  document.getElementById('normalizeToggle').addEventListener('click', toggleNormalize);

  // Load initial data in parallel
  await Promise.allSettled([
    loadPriceData(30),
    updateTicker(),
    loadTweets(),
    loadNews(),
  ]);

  // Set up auto-refresh intervals
  setInterval(updateTicker, 60_000);       // Ticker: every 1 min
  setInterval(loadTweets, 900_000);        // Tweets: every 15 min
  setInterval(loadNews, 180_000);          // News: every 3 min
}

init().catch(err => console.error('Dashboard init failed:', err));
