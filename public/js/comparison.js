import { fetchJSON, toUnix } from './utils.js';
import { setComparisonData, clearComparison, normalizeData, applyNormalized, loadPriceData, loadPriceRange } from './chart.js';

let currentMode = null;
let normalized = false;
let currentPrimaryData = null;
let currentComparisonData = null;
let currentOffset = 0;

let currentRange = { type: 'days', days: 30 };

export function setCurrentRange(range) {
  currentRange = range;
}

export async function toggleComparison(mode) {
  if (currentMode === mode) {
    currentMode = null;
    normalized = false;
    clearComparison();
    updateLegend(null);
    updateButtons(null);
    document.getElementById('normalizeToggle').classList.remove('active');
    return;
  }

  currentMode = mode;
  updateButtons(mode);
  await loadComparison();
}

export async function toggleNormalize() {
  normalized = !normalized;
  document.getElementById('normalizeToggle').classList.toggle('active', normalized);

  if (!currentMode || !currentPrimaryData || !currentComparisonData) return;

  if (normalized) {
    const { primary, comparison } = normalizeData(
      currentPrimaryData.prices,
      currentComparisonData.prices,
      currentOffset
    );
    applyNormalized(primary, comparison);
  } else {
    if (currentRange.type === 'days') {
      await loadPriceData(currentRange.days);
    } else {
      await loadPriceRange(currentRange.from, currentRange.to);
    }
    setComparisonData(currentComparisonData.prices, currentOffset, false);
  }
}

async function loadComparison() {
  let fromTs, toTs;

  if (currentRange.type === 'days') {
    toTs = Math.floor(Date.now() / 1000);
    fromTs = toTs - currentRange.days * 86400;
  } else {
    fromTs = currentRange.from;
    toTs = currentRange.to;
  }

  const rangeLength = toTs - fromTs;
  let compFrom, compTo;

  switch (currentMode) {
    case 'yoy':
      compFrom = fromTs - 365 * 86400;
      compTo = toTs - 365 * 86400;
      break;
    case 'mom':
      compFrom = fromTs - 30 * 86400;
      compTo = toTs - 30 * 86400;
      break;
    case 'pop':
      compFrom = fromTs - rangeLength;
      compTo = fromTs;
      break;
    default:
      return;
  }

  currentOffset = fromTs - compFrom;

  try {
    let primaryUrl;
    if (currentRange.type === 'days') {
      primaryUrl = `/api/price?days=${currentRange.days}`;
    } else {
      primaryUrl = `/api/price_range?from=${currentRange.from}&to=${currentRange.to}`;
    }

    const [primaryData, compData] = await Promise.all([
      fetchJSON(primaryUrl),
      fetchJSON(`/api/price_range?from=${compFrom}&to=${compTo}`),
    ]);

    currentPrimaryData = primaryData;
    currentComparisonData = compData;

    if (normalized) {
      const { primary, comparison } = normalizeData(
        primaryData.prices,
        compData.prices,
        currentOffset
      );
      applyNormalized(primary, comparison);
    } else {
      setComparisonData(compData.prices, currentOffset, false);
    }

    updateLegend(currentMode);
  } catch (err) {
    console.error('Comparison fetch failed:', err);
  }
}

function updateButtons(activeMode) {
  document.querySelectorAll('.comparison-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === activeMode);
  });
}

function updateLegend(mode) {
  const legend = document.getElementById('chartLegend');
  if (!mode) {
    legend.innerHTML = '';
    return;
  }

  const labels = { yoy: 'Year Ago', mom: 'Month Ago', pop: 'Prior Period' };
  legend.innerHTML = `
    <span class="chart-legend-item">
      <span class="chart-legend-dot" style="background: #f7931a;"></span>
      Current
    </span>
    <span class="chart-legend-item">
      <span class="chart-legend-dot" style="background: rgba(139, 148, 158, 0.6);"></span>
      ${labels[mode]}
    </span>
  `;
}

export async function onRangeChange() {
  if (currentMode) {
    await loadComparison();
  }
}
