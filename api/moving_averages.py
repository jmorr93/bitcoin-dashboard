from http.server import BaseHTTPRequestHandler
import json
import urllib.request
import time

_cache = {}
CACHE_TTL = 600  # 10 minutes — this data changes slowly


def _daily_close(prices):
    """Deduplicate to one price per day (keep last entry per UTC day)."""
    if not prices:
        return []

    days = {}
    for ts_ms, price in prices:
        day_key = int(ts_ms // 86400000)  # UTC day
        if day_key not in days or ts_ms > days[day_key][0]:
            days[day_key] = (ts_ms, price)

    sorted_days = sorted(days.items())
    return [(v[0], v[1]) for _, v in sorted_days]


def _compute_ma(daily_prices, period):
    """Compute simple moving average: arithmetic mean over a rolling window of N days."""
    result = []
    for i in range(period - 1, len(daily_prices)):
        window = daily_prices[i - period + 1 : i + 1]
        avg = sum(p for _, p in window) / period
        ts_ms = daily_prices[i][0]
        result.append([ts_ms, round(avg, 2)])
    return result


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            now = time.time()
            cache_key = "ma_daily"

            if cache_key in _cache and (now - _cache[cache_key]["ts"]) < CACHE_TTL:
                data = _cache[cache_key]["data"]
            else:
                # Fetch 365 days of daily data (enough for 200-day MA + buffer)
                url = (
                    "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart"
                    "?vs_currency=usd&days=365&precision=2"
                )
                req = urllib.request.Request(url, headers={"Accept": "application/json"})
                with urllib.request.urlopen(req, timeout=15) as resp:
                    raw = json.loads(resp.read())

                daily = _daily_close(raw.get("prices", []))

                data = {
                    "ma20": _compute_ma(daily, 20),
                    "ma50": _compute_ma(daily, 50),
                    "ma100": _compute_ma(daily, 100),
                    "ma200": _compute_ma(daily, 200),
                }
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

    def log_message(self, format, *args):
        pass
