from http.server import BaseHTTPRequestHandler
import json
import urllib.request
import urllib.parse
import time
import os

_cache = {}
CACHE_TTL = 180


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            category = params.get("category", ["all"])[0]
            if category not in ("all", "bitcoin", "macro"):
                category = "all"

            cache_key = f"news:{category}"
            now = time.time()

            if cache_key in _cache and (now - _cache[cache_key]["ts"]) < CACHE_TTL:
                data = _cache[cache_key]["data"]
            else:
                articles = []

                if category in ("all", "bitcoin"):
                    articles.extend(self._fetch_cryptopanic())
                    articles.extend(self._fetch_coingecko_news())

                if category in ("all", "macro"):
                    articles.extend(self._fetch_rss_news())

                seen = set()
                unique = []
                for a in sorted(articles, key=lambda x: x.get("timestamp", ""), reverse=True):
                    title_key = a.get("title", "").lower()[:60]
                    if title_key not in seen:
                        seen.add(title_key)
                        unique.append(a)
                unique = unique[:50]

                data = {"articles": unique, "category": category}
                _cache[cache_key] = {"data": data, "ts": now}

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(data).encode())

        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def _fetch_cryptopanic(self):
        articles = []
        try:
            token = os.environ.get("CRYPTOPANIC_TOKEN", "")
            if token:
                url = f"https://cryptopanic.com/api/v1/posts/?auth_token={token}&currencies=BTC&kind=news&public=true"
            else:
                url = "https://cryptopanic.com/api/free/v1/posts/?currencies=BTC&kind=news&public=true"

            req = urllib.request.Request(url, headers={
                "Accept": "application/json",
                "User-Agent": "BTCDashboard/1.0",
            })
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read())

            for post in data.get("results", [])[:20]:
                articles.append({
                    "title": post.get("title", ""),
                    "url": post.get("url", ""),
                    "source": post.get("source", {}).get("title", "CryptoPanic"),
                    "timestamp": post.get("published_at", ""),
                    "category": "bitcoin",
                })
        except Exception:
            pass
        return articles

    def _fetch_coingecko_news(self):
        articles = []
        try:
            url = "https://api.coingecko.com/api/v3/search/trending"
            req = urllib.request.Request(url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read())

            for coin in data.get("coins", [])[:5]:
                item = coin.get("item", {})
                articles.append({
                    "title": f"{item.get('name', '')} ({item.get('symbol', '')}) trending on CoinGecko",
                    "url": f"https://www.coingecko.com/en/coins/{item.get('id', '')}",
                    "source": "CoinGecko",
                    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "category": "bitcoin",
                })
        except Exception:
            pass
        return articles

    def _fetch_rss_news(self):
        articles = []
        feeds = [
            ("https://feeds.bloomberg.com/markets/news.rss", "Bloomberg", "macro"),
            ("https://www.coindesk.com/arc/outboundfeeds/rss/", "CoinDesk", "bitcoin"),
        ]

        for feed_url, source, cat in feeds:
            try:
                req = urllib.request.Request(feed_url, headers={
                    "User-Agent": "BTCDashboard/1.0",
                })
                with urllib.request.urlopen(req, timeout=5) as resp:
                    xml = resp.read().decode("utf-8", errors="replace")

                items = xml.split("<item>")[1:]
                for item_xml in items[:10]:
                    title = self._extract_tag(item_xml, "title")
                    link = self._extract_tag(item_xml, "link")
                    pub_date = self._extract_tag(item_xml, "pubDate")

                    if title:
                        iso_date = self._parse_rss_date(pub_date) if pub_date else ""
                        articles.append({
                            "title": title,
                            "url": link or "",
                            "source": source,
                            "timestamp": iso_date,
                            "category": cat,
                        })
            except Exception:
                continue

        return articles

    def _extract_tag(self, xml, tag):
        start = xml.find(f"<{tag}>")
        if start == -1:
            start = xml.find(f"<{tag} ")
        if start == -1:
            return ""
        start = xml.find(">", start) + 1
        end = xml.find(f"</{tag}>", start)
        if end == -1:
            return ""
        text = xml[start:end].strip()
        if text.startswith("<![CDATA["):
            text = text[9:]
        if text.endswith("]]>"):
            text = text[:-3]
        return text

    def _parse_rss_date(self, date_str):
        try:
            from email.utils import parsedate_to_datetime
            dt = parsedate_to_datetime(date_str)
            return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        except Exception:
            return date_str

    def log_message(self, format, *args):
        pass
