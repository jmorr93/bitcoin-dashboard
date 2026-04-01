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
      renderTweetCard(card, result.value.tweets, handle, initials);
    } else {
      renderErrorCard(card, handle, initials);
    }
  });
}

function renderTweetCard(card, tweets, handle, initials) {
  card.classList.remove('loading');

  const tweetsHtml = tweets.map(tweet => {
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

    return `
      <div class="tweet-item">
        <div class="tweet-item-time">${relativeTime(tweet.created_at)}</div>
        <p class="tweet-text">${escapeHtml(tweet.text)}</p>
        ${metricsHtml}
      </div>
    `;
  }).join('');

  card.innerHTML = `
    <div class="tweet-card-header">
      <div class="tweet-avatar">${initials}</div>
      <span class="tweet-handle">@${handle}</span>
    </div>
    <div class="tweet-scroll">
      ${tweetsHtml}
    </div>
  `;

  card.querySelector('.tweet-card-header').onclick = (e) => {
    e.stopPropagation();
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
    <div class="tweet-scroll">
      <div class="tweet-item">
        <p class="tweet-text" style="color: var(--text-muted);">Unable to load tweets</p>
      </div>
    </div>
  `;
  card.querySelector('.tweet-card-header').onclick = () => {
    window.open(`https://x.com/${handle}`, '_blank');
  };
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
