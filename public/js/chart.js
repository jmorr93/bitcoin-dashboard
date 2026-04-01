import { fetchJSON, formatCurrency, formatDate } from './utils.js';

let chart = null;
let primarySeries = null;
let comparisonSeries = null;

export function initChart(container) {
  chart = LightweightCharts.createChart(container, {
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

  // Handle resize
  const resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      chart.applyOptions({ width, height });
    }
  });
  resizeObserver.observe(container);

  return chart;
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
    lineStyle: 2, // dashed
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

export function getChart() {
  return chart;
}
