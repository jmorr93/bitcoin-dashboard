import { fetchJSON, relativeTime, formatNumber } from './utils.js';

const HANDLES = [
  { handle: 'zerohedge', initials: 'ZH' },
  { handle: 'prestonpysh', initials: 'PP' },
  { handle: 'LukeGromen', initials: 'LG' },
  { handle: 'jackmallers', initials: 'JM' },
  { handle: 'LynAldenContact', initials: 'LA' },
  { handle: 'willywoo', initials: 'WW' },
];

export async function loadTweets() {
  const results = await Promise.allSettled(
    HANDLES.map(({ handle }) => fetchJSON(`/api/tweets?handle=${handle}`))
  );

  results.forEach((result, i) => {
    const { handle, initials } = HANDLES[i];
    const card = document.querySelector(`.tweet-card[data-handle="${handle}"]`);
    if (!card) return;

    if (result.status === 'fulfilled' && result.value.tweets?.length) {
      const tweet = result.value.tweets[0]; // Latest tweet
      renderTweetCard(card, tweet, handle, initials);
    } else {
      renderErrorCard(card, handle, initials);
    }
  });
}

function renderTweetCard(card, tweet, handle, initials) {
  card.classList.remove('loading');

  const metrics = [
    { icon: '&#9829;', value: tweet.favorite_count },
    { icon: '&#8634;', value: tweet.retweet_count },
    { icon: '&#9993;', value: tweet.reply_count },
  ].filter(m => m.value > 0);

  const metricsHtml = metrics.length
    ? `<div class="tweet-metrics">${metrics.map(m =>
        `<span class="tweet-metric">${m.icon} ${formatNumber(m.value, true)}</span>`
      ).join('')}</div>`
    : '';

  card.innerHTML = `
    <div class="tweet-card-header">
      <div class="tweet-avatar">${initials}</div>
      <span class="tweet-handle">@${handle}</span>
      <span class="tweet-time">${relativeTime(tweet.created_at)}</span>
    </div>
    <p class="tweet-text">${escapeHtml(tweet.text)}</p>
    ${metricsHtml}
  `;

  card.onclick = () => {
    window.open(`https://x.com/${handle}`, '_blank');
  };
}

function renderErrorCard(card, handle, initials) {
  card.classList.remove('loading');
  card.innerHTML = `
    <div class="tweet-card-header">
      <div class="tweet-avatar">${initials}</div>
      <span class="tweet-handle">@${handle}</span>
    </div>
    <p class="tweet-text" style="color: var(--text-muted);">Unable to load tweets</p>
  `;
  card.onclick = () => {
    window.open(`https://x.com/${handle}`, '_blank');
  };
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
