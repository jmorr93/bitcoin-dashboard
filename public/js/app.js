import { initChart, loadPriceData, loadMovingAverages } from './chart.js';
import { updateTicker } from './ticker.js';
import { initRangeSelector } from './range-selector.js';
import { toggleComparison, toggleNormalize } from './comparison.js';
import { loadTweets } from './tweets.js';
import { loadNews, initNewsTabs } from './news.js';

async function init() {
  const chartTarget = document.getElementById('chartTarget');
  initChart(chartTarget);

  initRangeSelector();
  initNewsTabs();

  document.getElementById('comparisonButtons').addEventListener('click', (e) => {
    const btn = e.target.closest('.comparison-btn');
    if (btn) toggleComparison(btn.dataset.mode);
  });

  document.getElementById('normalizeToggle').addEventListener('click', toggleNormalize);

  // Refresh tweets button (forces fresh fetch from Apify if cache is stale)
  const refreshBtn = document.getElementById('refreshTweets');
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.classList.add('loading');
    refreshBtn.textContent = '↻ Loading...';
    await loadTweets();
    refreshBtn.classList.remove('loading');
    refreshBtn.innerHTML = '&#8635; Refresh';
  });

  // Load all data on page load (tweets come from Supabase cache if available)
  await Promise.allSettled([
    loadPriceData(30),
    loadMovingAverages(),
    updateTicker(),
    loadTweets(),
    loadNews(),
  ]);

  setInterval(updateTicker, 60_000);
  setInterval(loadNews, 180_000);
}

init().catch(err => console.error('Dashboard init failed:', err));
