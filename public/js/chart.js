import { fetchJSON, formatCurrency, formatDate } from './utils.js';

let chart = null;
let primarySeries = null;
let comparisonSeries = null;
let maSeries = {};
let maData = {};       // cached raw data per MA key
let maVisible = {};    // track which MAs are currently visible
let activeDays = 30;   // current time range in days

const MA_CONFIG = {
  ma20:  { color: '#22d3ee', label: '20D MA',  lineWidth: 1, minDays: 20 },
  ma50:  { color: '#a78bfa', label: '50D MA',  lineWidth: 1, minDays: 50 },
  ma100: { color: '#fb923c', label: '100D MA', lineWidth: 1, minDays: 100 },
  ma200: { color: '#f472b6', label: '200D MA', lineWidth: 1, minDays: 200 },
};

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function _tickMarkFormatter(time, tickMarkType, locale) {
  const d = new Date(time * 1000);
  if (activeDays <= 1) {
    // 1D — show hours
    return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  if (activeDays <= 7) {
    // 1W — show day + month
    return `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`;
  }
  if (activeDays <= 90) {
    // 1M / 3M — show month + day
    return `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`;
  }
  // 6M / 1Y — show month + year
  return `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function initChart(container) {
  const rect = container.getBoundingClientRect();
  const width = rect.width || container.clientWidth || 800;
  const height = rect.height || container.clientHeight || 400;

  chart = LightweightCharts.createChart(container, {
    width,
    height,
    layout: {
      background: { type: 'solid', color: 'transparent' },
      textColor: '#8b949e',
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 11,
    },
    grid: {
      vertLines: { color: 'rgba(48, 54, 61, 0.4)' },
      horzLines: { color: 'rgba(48, 54, 61, 0.4)' },
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
      vertLine: { color: 'rgba(247, 147, 26, 0.3)', width: 1, style: 0 },
      horzLine: { color: 'rgba(247, 147, 26, 0.3)', width: 1, style: 0 },
    },
    rightPriceScale: {
      borderColor: '#30363d',
      scaleMargins: { top: 0.1, bottom: 0.1 },
    },
    timeScale: {
      borderColor: '#30363d',
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 5,
      fixLeftEdge: true,
      fixRightEdge: true,
      tickMarkFormatter: _tickMarkFormatter,
    },
    handleScroll: { vertTouchDrag: false },
    handleScale: { axisPressedMouseMove: true },
  });

  primarySeries = chart.addLineSeries({
    color: '#f7931a',
    lineWidth: 2,
    crosshairMarkerVisible: true,
    crosshairMarkerRadius: 4,
    priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    lastValueVisible: true,
    priceLineVisible: true,
    priceLineColor: 'rgba(247, 147, 26, 0.4)',
    priceLineStyle: 2,
  });

  const resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        chart.applyOptions({ width, height });
      }
    }
  });
  resizeObserver.observe(container);

  return chart;
}

export async function loadPriceData(days = 30) {
  activeDays = days;
  const data = await fetchJSON(`/api/price?days=${days}`);
  const prices = data.prices.map(([time, value]) => ({
    time: Math.floor(time / 1000),
    value,
  }));
  primarySeries.setData(prices);

  // Update time scale visibility for the new range
  chart.timeScale().applyOptions({
    timeVisible: days <= 7,  // show time-of-day only for 1D/1W
  });

  chart.timeScale().fitContent();
  _applyMAForRange();
  return data;
}

export async function loadPriceRange(fromTs, toTs) {
  activeDays = Math.round((toTs - fromTs) / 86400);
  const data = await fetchJSON(`/api/price_range?from=${fromTs}&to=${toTs}`);
  const prices = data.prices.map(([time, value]) => ({
    time: Math.floor(time / 1000),
    value,
  }));
  primarySeries.setData(prices);

  chart.timeScale().applyOptions({
    timeVisible: activeDays <= 7,
  });

  chart.timeScale().fitContent();
  _applyMAForRange();
  return data;
}

export function setComparisonData(data, offset, normalize = false) {
  if (comparisonSeries) {
    chart.removeSeries(comparisonSeries);
    comparisonSeries = null;
  }

  if (!data || data.length === 0) return;

  comparisonSeries = chart.addLineSeries({
    color: 'rgba(139, 148, 158, 0.6)',
    lineWidth: 1,
    lineStyle: 2,
    crosshairMarkerVisible: false,
    lastValueVisible: false,
    priceLineVisible: false,
    priceScaleId: normalize ? 'right' : 'comparison',
  });

  if (!normalize) {
    chart.priceScale('comparison').applyOptions({
      scaleMargins: { top: 0.1, bottom: 0.1 },
      visible: false,
    });
  }

  const shifted = data.map(([time, value]) => ({
    time: Math.floor(time / 1000) + offset,
    value,
  }));

  comparisonSeries.setData(shifted);
}

export function clearComparison() {
  if (comparisonSeries) {
    chart.removeSeries(comparisonSeries);
    comparisonSeries = null;
  }
}

export function normalizeData(primaryData, comparisonData, offset) {
  if (!primaryData?.length || !comparisonData?.length) return { primary: [], comparison: [] };

  const pBase = primaryData[0][1];
  const cBase = comparisonData[0][1];

  const primary = primaryData.map(([time, value]) => ({
    time: Math.floor(time / 1000),
    value: ((value - pBase) / pBase) * 100,
  }));

  const comparison = comparisonData.map(([time, value]) => ({
    time: Math.floor(time / 1000) + offset,
    value: ((value - cBase) / cBase) * 100,
  }));

  return { primary, comparison };
}

export function applyNormalized(primaryPoints, comparisonPoints) {
  primarySeries.setData(primaryPoints);

  if (comparisonSeries) {
    chart.removeSeries(comparisonSeries);
  }

  comparisonSeries = chart.addLineSeries({
    color: 'rgba(139, 148, 158, 0.6)',
    lineWidth: 1,
    lineStyle: 2,
    crosshairMarkerVisible: false,
    lastValueVisible: false,
    priceLineVisible: false,
  });

  comparisonSeries.setData(comparisonPoints);
  chart.timeScale().fitContent();
}

export async function loadMovingAverages() {
  const data = await fetchJSON('/api/moving_averages');

  // Remove any existing MA series from chart
  _removeAllMASeries();
  maData = {};

  // Cache all MA data (don't render yet — _applyMAForRange handles that)
  for (const [key] of Object.entries(MA_CONFIG)) {
    const raw = data[key];
    if (!raw || raw.length === 0) continue;

    maData[key] = raw.map(([time, value]) => ({
      time: Math.floor(time / 1000),
      value,
    }));
  }

  _applyMAForRange();
}

function _isMAEligible(key) {
  return activeDays >= MA_CONFIG[key].minDays;
}

/** Show/hide MAs based on current activeDays and user toggle state. */
function _applyMAForRange() {
  for (const [key, cfg] of Object.entries(MA_CONFIG)) {
    const eligible = _isMAEligible(key);
    const btn = document.querySelector(`.ma-toggle[data-ma="${key}"]`);

    if (!eligible) {
      // Remove series if showing, disable button
      if (maSeries[key]) {
        chart.removeSeries(maSeries[key]);
        delete maSeries[key];
      }
      if (btn) {
        btn.classList.remove('active');
        btn.disabled = true;
        btn.style.opacity = '0.3';
      }
      maVisible[key] = false;
    } else {
      // Enable button
      if (btn) {
        btn.disabled = false;
        btn.style.opacity = '';
      }
      // Auto-show eligible MAs that the user hasn't explicitly toggled off
      // On first load or range change, default: show if user had it on OR if it wasn't set yet
      if (maVisible[key] === undefined) {
        // First time: show 50 and 200 by default when eligible
        maVisible[key] = (key === 'ma50' || key === 'ma200');
      }
      if (maVisible[key] && !maSeries[key] && maData[key]) {
        _addMASeries(key);
      }
    }
  }

  updateMALegend();
}

function _addMASeries(key) {
  const cfg = MA_CONFIG[key];
  if (!cfg || !maData[key]) return;

  const series = chart.addLineSeries({
    color: cfg.color,
    lineWidth: cfg.lineWidth,
    crosshairMarkerVisible: false,
    lastValueVisible: false,
    priceLineVisible: false,
  });
  series.setData(maData[key]);
  maSeries[key] = series;
}

function _removeAllMASeries() {
  for (const key of Object.keys(maSeries)) {
    if (maSeries[key]) {
      chart.removeSeries(maSeries[key]);
    }
  }
  maSeries = {};
}

export function toggleMA(key) {
  if (!MA_CONFIG[key] || !maData[key] || !_isMAEligible(key)) return;

  if (maVisible[key]) {
    if (maSeries[key]) {
      chart.removeSeries(maSeries[key]);
      delete maSeries[key];
    }
    maVisible[key] = false;
  } else {
    _addMASeries(key);
    maVisible[key] = true;
  }

  const btn = document.querySelector(`.ma-toggle[data-ma="${key}"]`);
  if (btn) btn.classList.toggle('active', !!maVisible[key]);
  updateMALegend();
}

function updateMALegend() {
  const legend = document.getElementById('chartLegend');
  if (!legend) return;

  // Clear existing MA legend items
  legend.querySelectorAll('.ma-legend-item').forEach(el => el.remove());

  for (const [key, cfg] of Object.entries(MA_CONFIG)) {
    if (!maSeries[key]) continue;
    const item = document.createElement('span');
    item.className = 'chart-legend-item ma-legend-item';
    item.innerHTML = `<span class="chart-legend-dot" style="background:${cfg.color}"></span>${cfg.label}`;
    legend.appendChild(item);
  }
}

export function getChart() {
  return chart;
}
