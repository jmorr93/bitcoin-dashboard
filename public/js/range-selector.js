import { loadPriceData, loadPriceRange } from './chart.js';
import { setCurrentRange, onRangeChange } from './comparison.js';
import { toUnix } from './utils.js';

export function initRangeSelector() {
  const rangeButtons = document.getElementById('rangeButtons');
  const rangeFrom = document.getElementById('rangeFrom');
  const rangeTo = document.getElementById('rangeTo');
  const rangeApply = document.getElementById('rangeApply');

  // Set default date values
  const today = new Date();
  const monthAgo = new Date(today);
  monthAgo.setDate(monthAgo.getDate() - 30);

  rangeTo.value = today.toISOString().split('T')[0];
  rangeFrom.value = monthAgo.toISOString().split('T')[0];

  // Preset range buttons
  rangeButtons.addEventListener('click', async (e) => {
    const btn = e.target.closest('.range-btn');
    if (!btn) return;

    const days = parseInt(btn.dataset.days);

    // Update active state
    rangeButtons.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Update range state
    setCurrentRange({ type: 'days', days });

    // Load data
    await loadPriceData(days);
    await onRangeChange();

    // Update date inputs to match
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - days);
    rangeTo.value = to.toISOString().split('T')[0];
    rangeFrom.value = from.toISOString().split('T')[0];
  });

  // Custom date range
  rangeApply.addEventListener('click', async () => {
    const from = rangeFrom.value;
    const to = rangeTo.value;
    if (!from || !to) return;

    const fromTs = toUnix(from);
    const toTs = toUnix(to) + 86400; // Include end date

    // Clear active preset button
    rangeButtons.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));

    // Update range state
    setCurrentRange({ type: 'custom', from: fromTs, to: toTs });

    // Load data
    await loadPriceRange(fromTs, toTs);
    await onRangeChange();
  });
}
