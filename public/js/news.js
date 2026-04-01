import { fetchJSON, relativeTime } from './utils.js';

let currentCategory = 'all';
let allArticles = [];

export async function loadNews() {
  try {
    const data = await fetchJSON(`/api/news?category=all`);
    allArticles = data.articles || [];
    renderNews(filterByCategory(allArticles, currentCategory));
  } catch (err) {
    console.error('News fetch failed:', err);
    renderNewsError();
  }
}

export function initNewsTabs() {
  const tabs = document.getElementById('newsTabs');
  tabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.news-tab');
    if (!tab) return;

    currentCategory = tab.dataset.category;
    tabs.querySelectorAll('.news-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    renderNews(filterByCategory(allArticles, currentCategory));
  });
}

function filterByCategory(articles, category) {
  if (category === 'all') return articles;
  return articles.filter(a => a.category === category);
}

function renderNews(articles) {
  const feed = document.getElementById('newsFeed');

  if (!articles.length) {
    feed.innerHTML = `
      <div style="padding: 40px 16px; text-align: center; color: var(--text-muted);">
        No articles found
      </div>
    `;
    return;
  }

  feed.innerHTML = articles.map(article => `
    <a class="news-item" href="${escapeAttr(article.url)}" target="_blank" rel="noopener">
      <div class="news-item-header">
        <span class="news-source">${escapeHtml(article.source)}</span>
        <span class="news-category-tag ${article.category}">${article.category}</span>
        <span class="news-time">${article.timestamp ? relativeTime(article.timestamp) : ''}</span>
      </div>
      <h3 class="news-title">${escapeHtml(article.title)}</h3>
    </a>
  `).join('');
}

function renderNewsError() {
  const feed = document.getElementById('newsFeed');
  feed.innerHTML = `
    <div style="padding: 40px 16px; text-align: center; color: var(--text-muted);">
      Unable to load news. Will retry shortly.
    </div>
  `;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function escapeAttr(text) {
  return (text || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
