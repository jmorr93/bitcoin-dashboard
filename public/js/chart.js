import { fetchJSON, formatCurrency, formatDate } from './utils.js';

let chart = null;
let primarySeries = null;
let comparisonSeries = null;
let maSeries = {};
let maData = {};       // cached raw data per MA key
let maVisible = {};    // track which MAs are currently visible

const MA_CONFIG = {
  ma20:  { color: '#22d3ee', label: '20D MA',  lineWidth: 1, defaultOn: false },
  ma50:  { color: '#a78bfa', label: '50D MA',  lineWidth: 1, defaultOn: true },
  ma100: { color: '#fb923c', label: '100D MA', lineWidth: 1, defaultOn: false },
  ma200: { color: '#f472b6', label: '200D MA', lineWidth: 1, defaultOn: true },
};

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

  // When visible range changes (zoom/pan/range switch), re-clip MA data
  chart.timeScale().subscribeVisibleTimeRangeChange(() => {
    _refreshVisibleMAs();
  });

  return chart;
}

function _refreshVisibleMAs() {
  for (const key of Object.keys(maSeries)) {
    if (maSeries[key] && maData[key]) {
      maSeries[key].setData(_getVisibleMaData(key));
    }
  }
}

export async function loadPriceData(days = 30) {
  const data = await fetchJSON(`/api/price?days=${days}`);
  const prices = data.prices.map(([time, value]) => ({
    time: Math.floor(time / 1000),
    value,
  }));
  primarySeries.setData(prices);
  chart.timeScale().fitContent();
  return data;
}

export async function loadPriceRange(fromTs, toTs) {
  const data = await fetchJSON(`/api/price_range?from=${fromTs}&to=${toTs}`);
  const prices = data.prices.map(([time, value]) => ({
    time: Math.floor(time / 1000),
    value,
  }));
  primarySeries.setData(prices);
  chart.timeScale().fitContent();
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

  // Remove existing MA series
  for (const key of Object.keys(maSeries)) {
    if (maSeries[key]) {
      chart.removeSeries(maSeries[key]);
    }
  }
  maSeries = {};
  maData = {};

  // Cache all MA data and only render those marked defaultOn
  for (const [key, cfg] of Object.entries(MA_CONFIG)) {
    const raw = data[key];
    if (!raw || raw.length === 0) continue;

    maData[key] = raw.map(([time, value]) => ({
      time: Math.floor(time / 1000),
      value,
    }));

    maVisible[key] = cfg.defaultOn;

    if (cfg.defaultOn) {
      _addMASeries(key);
    }
  }

  updateMALegend();
  updateMAToggles();
}

function _getVisibleMaData(key) {
  // Clip MA data to the primary price series time range so MAs don't
  // expand the time axis (which was causing the y-axis to stretch).
  const points = maData[key];
  if (!points || !points.length) return points;

  const timeRange = chart.timeScale().getVisibleRange();
  if (!timeRange) {
    // Fallback: use primary series data bounds
    const pd = primarySeries ? primarySeries.data?.() : null;
    if (!pd || !pd.length) return points;
    const first = pd[0].time;
    const last = pd[pd.length - 1].time;
    return points.filter(p => p.time >= first && p.time <= last);
  }
  return points.filter(p => p.time >= timeRange.from && p.time <= timeRange.to);
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
  series.setData(_getVisibleMaData(key));
  maSeries[key] = series;
}

export function toggleMA(key) {
  if (!MA_CONFIG[key] || !maData[key]) return;

  if (maVisible[key]) {
    // Hide
    if (maSeries[key]) {
      chart.removeSeries(maSeries[key]);
      delete maSeries[key];
    }
    maVisible[key] = false;
  } else {
    // Show
    _addMASeries(key);
    maVisible[key] = true;
  }

  updateMALegend();
  updateMAToggles();
}

function updateMAToggles() {
  for (const key of Object.keys(MA_CONFIG)) {
    const btn = document.querySelector(`.ma-toggle[data-ma="${key}"]`);
    if (btn) {
      btn.classList.toggle('active', !!maVisible[key]);
    }
  }
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
