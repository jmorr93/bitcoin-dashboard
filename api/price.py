from http.server import BaseHTTPRequestHandler
import json
import urllib.request
import urllib.parse
import time

_cache = {}
CACHE_TTL = 300


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            days = params.get("days", ["30"])[0]
            vs = params.get("vs", ["usd"])[0]

            if not days.isdigit() or int(days) < 1 or int(days) > 365:
                days = "30"
            if vs not in ("usd", "eur", "gbp"):
                vs = "usd"

            cache_key = f"price:{days}:{vs}"
            now = time.time()

            if cache_key in _cache and (now - _cache[cache_key]["ts"]) < CACHE_TTL:
                data = _cache[cache_key]["data"]
            else:
                url = (
                    f"https://api.coingecko.com/api/v3/coins/bitcoin/market_chart"
                    f"?vs_currency={vs}&days={days}&precision=2"
                )
                req = urllib.request.Request(url, headers={"Accept": "application/json"})
                with urllib.request.urlopen(req, timeout=8) as resp:
                    data = json.loads(resp.read())
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
