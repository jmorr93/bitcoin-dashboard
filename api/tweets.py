from http.server import BaseHTTPRequestHandler
import json
import urllib.request
import urllib.parse
import urllib.error
import os
import time
from datetime import datetime, timedelta, timezone

ALLOWED_HANDLES = {
    "zerohedge", "prestonpysh", "LukeGromen",
    "jackmallers", "LynAldenContact", "willywoo",
}

STALE_THRESHOLD_HOURS = 1
RETENTION_DAYS = 7


def supabase_request(method, path, body=None, upsert=False):
    """Make a direct REST API call to Supabase (no SDK needed)."""
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_KEY", "")
    if not url or not key:
        return None

    full_url = f"{url}/rest/v1/{path}"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    if upsert:
        headers["Prefer"] = "resolution=merge-duplicates,return=representation"

    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(full_url, data=data, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode() if e.fp else ""
        print(f"Supabase error {e.code}: {error_body}")
        return None
    except Exception as e:
        print(f"Supabase request failed: {e}")
        return None


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

            token = os.environ.get("APIFY_TOKEN", "")
            has_supabase = bool(os.environ.get("SUPABASE_URL"))

            if has_supabase:
                data = self._get_with_cache(handle, token)
            elif token:
                data = self._fetch_from_apify(handle, token)
            else:
                data = self._mock_tweets(handle)

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

    def _get_with_cache(self, handle, token):
        """Check Supabase for recent tweets. Fetch from Apify only if stale."""
        now = datetime.now(timezone.utc)
        stale_cutoff = (now - timedelta(hours=STALE_THRESHOLD_HOURS)).isoformat()

        # Query Supabase for cached tweets (up to 20 from last 7 days)
        query = (
            f"tweets?handle=eq.{handle}"
            f"&order=created_at.desc"
            f"&limit=20"
        )
        cached_tweets = supabase_request("GET", query)

        if cached_tweets is None:
            # Supabase unavailable, fall back
            if token:
                return self._fetch_from_apify(handle, token)
            return self._mock_tweets(handle)

        # Check if cache is fresh
        is_fresh = False
        if cached_tweets:
            latest_fetched = cached_tweets[0].get("fetched_at", "")
            if latest_fetched and latest_fetched > stale_cutoff:
                is_fresh = True

        if is_fresh:
            tweets = [self._format_tweet(t) for t in cached_tweets]
            return {"tweets": tweets, "handle": handle, "source": "cache"}

        # Stale or empty — fetch from Apify
        if not token:
            if cached_tweets:
                tweets = [self._format_tweet(t) for t in cached_tweets]
                return {"tweets": tweets, "handle": handle, "source": "cache_stale"}
            return self._mock_tweets(handle)

        fresh_data = self._fetch_from_apify(handle, token)

        # Store in Supabase via upsert
        for tweet in fresh_data.get("tweets", []):
            created = tweet["created_at"] or now.isoformat()
            row = {
                "id": tweet["id"],
                "handle": handle,
                "text": tweet["text"],
                "created_at": created,
                "retweet_count": tweet["retweet_count"],
                "favorite_count": tweet["favorite_count"],
                "reply_count": tweet["reply_count"],
                "fetched_at": now.isoformat(),
            }
            supabase_request("POST", "tweets", row, upsert=True)

        # Clean up old tweets
        cutoff = (now - timedelta(days=RETENTION_DAYS)).isoformat()
        supabase_request(
            "DELETE",
            f"tweets?handle=eq.{handle}&created_at=lt.{cutoff}"
        )

        return fresh_data

    def _format_tweet(self, row):
        return {
            "id": row.get("id", ""),
            "text": row.get("text", ""),
            "created_at": row.get("created_at", ""),
            "retweet_count": row.get("retweet_count", 0),
            "favorite_count": row.get("favorite_count", 0),
            "reply_count": row.get("reply_count", 0),
            "handle": row.get("handle", ""),
        }

    def _fetch_from_apify(self, handle, token):
        actor_id = "apidojo~tweet-scraper"
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

        with urllib.request.urlopen(req, timeout=120) as resp:
            items = json.loads(resp.read())

        now_iso = datetime.now(timezone.utc).isoformat()
        tweets = []
        for item in items[:3]:
            # Apify returns created_at in various formats, fall back to now
            created = item.get("created_at") or item.get("createdAt") or item.get("timestamp") or now_iso
            tweets.append({
                "id": str(item.get("id", str(time.time()))),
                "text": item.get("full_text", item.get("text", "")),
                "created_at": created,
                "retweet_count": item.get("retweet_count", 0),
                "favorite_count": item.get("favorite_count", item.get("like_count", 0)),
                "reply_count": item.get("reply_count", 0),
                "handle": handle,
            })

        return {"tweets": tweets, "handle": handle, "source": "apify"}

    def _mock_tweets(self, handle):
        return {
            "tweets": [{
                "id": f"mock_{handle}",
                "text": f"Configure APIFY_TOKEN env var to see live tweets from @{handle}",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "retweet_count": 0,
                "favorite_count": 0,
                "reply_count": 0,
                "handle": handle,
            }],
            "handle": handle,
            "source": "mock",
        }

    def log_message(self, format, *args):
        pass
