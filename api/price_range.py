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
            from_ts = params.get("from", [None])[0]
            to_ts = params.get("to", [None])[0]
            vs = params.get("vs", ["usd"])[0]

            if not from_ts or not to_ts:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "from and to required"}).encode())
                return

            try:
                from_ts = str(int(float(from_ts)))
                to_ts = str(int(float(to_ts)))
            except ValueError:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "invalid timestamp"}).encode())
                return

            if vs not in ("usd", "eur", "gbp"):
                vs = "usd"

            cache_key = f"range:{from_ts}:{to_ts}:{vs}"
            now = time.time()

            if cache_key in _cache and (now - _cache[cache_key]["ts"]) < CACHE_TTL:
                data = _cache[cache_key]["data"]
            else:
                url = (
                    f"https://api.coingecko.com/api/v3/coins/bitcoin/market_chart/range"
                    f"?vs_currency={vs}&from={from_ts}&to={to_ts}&precision=2"
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
