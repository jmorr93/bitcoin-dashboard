from http.server import BaseHTTPRequestHandler
import json
import urllib.request
import urllib.parse
import os
import time

_cache = {}
CACHE_TTL = 900

ALLOWED_HANDLES = {
    "zerohedge", "prestonpysh", "LukeGromen",
    "jackmallers", "LynAldenContact", "willywoo",
}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            handle = params.get("handle", [None])[0]

            if not handle or handle not in ALLOWED_HANDLES:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "invalid handle"}).encode())
                return

            cache_key = f"tweets:{handle}"
            now = time.time()

            if cache_key in _cache and (now - _cache[cache_key]["ts"]) < CACHE_TTL:
                data = _cache[cache_key]["data"]
            else:
                token = os.environ.get("APIFY_TOKEN", "")
                if not token:
                    data = self._mock_tweets(handle)
                else:
                    data = self._fetch_from_apify(handle, token)
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

    def _fetch_from_apify(self, handle, token):
        actor_id = "apidojo~tweet-scraper"
        # Use the profile URL approach with maxItems to strictly limit results
        run_url = (
            f"https://api.apify.com/v2/acts/{actor_id}/run-sync-get-dataset-items"
            f"?token={token}"
        )
        payload = json.dumps({
            "startUrls": [f"https://twitter.com/{handle}"],
            "maxItems": 3,
            "proxyConfig": {"useApifyProxy": True},
        }).encode()

        req = urllib.request.Request(
            run_url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        # Actor can take 1-2 min, Vercel free tier allows up to 60s
        with urllib.request.urlopen(req, timeout=120) as resp:
            items = json.loads(resp.read())

        tweets = []
        for item in items[:3]:
            tweets.append({
                "id": item.get("id", ""),
                "text": item.get("full_text", item.get("text", "")),
                "created_at": item.get("created_at", ""),
                "retweet_count": item.get("retweet_count", 0),
                "favorite_count": item.get("favorite_count", item.get("like_count", 0)),
                "reply_count": item.get("reply_count", 0),
                "handle": handle,
            })

        return {"tweets": tweets, "handle": handle}

    def _mock_tweets(self, handle):
        return {
            "tweets": [{
                "id": "mock_1",
                "text": f"Configure APIFY_TOKEN env var to see live tweets from @{handle}",
                "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "retweet_count": 0,
                "favorite_count": 0,
                "reply_count": 0,
                "handle": handle,
            }],
            "handle": handle,
            "mock": True,
        }

    def log_message(self, format, *args):
        pass
