from http.server import BaseHTTPRequestHandler
import json
import urllib.request
import urllib.parse
import os
import time
from datetime import datetime, timedelta, timezone

ALLOWED_HANDLES = {
    "zerohedge", "prestonpysh", "LukeGromen",
    "jackmallers", "LynAldenContact", "willywoo",
}

# How old the latest tweet can be before we fetch fresh ones
STALE_THRESHOLD_HOURS = 1
# How many days of tweets to keep in the database
RETENTION_DAYS = 7


def get_supabase():
    from supabase import create_client
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_KEY", "")
    if not url or not key:
        return None
    return create_client(url, key)


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

            sb = get_supabase()
            token = os.environ.get("APIFY_TOKEN", "")

            if sb:
                data = self._get_with_cache(sb, handle, token)
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

    def _get_with_cache(self, sb, handle, token):
        """Check Supabase for recent tweets. Fetch from Apify only if stale."""
        now = datetime.now(timezone.utc)
        stale_cutoff = (now - timedelta(hours=STALE_THRESHOLD_HOURS)).isoformat()

        # Get tweets from the last 7 days for this handle
        result = (
            sb.table("tweets")
            .select("*")
            .eq("handle", handle)
            .order("created_at", desc=True)
            .limit(10)
            .execute()
        )

        cached_tweets = result.data or []

        # Check if we have a recent fetch (fetched_at within the last hour)
        is_fresh = False
        if cached_tweets:
            latest_fetched = cached_tweets[0].get("fetched_at", "")
            if latest_fetched and latest_fetched > stale_cutoff:
                is_fresh = True

        if is_fresh:
            # Return cached tweets
            tweets = [self._format_tweet(t) for t in cached_tweets[:5]]
            return {"tweets": tweets, "handle": handle, "source": "cache"}

        # Stale or empty — fetch from Apify
        if not token:
            if cached_tweets:
                tweets = [self._format_tweet(t) for t in cached_tweets[:5]]
                return {"tweets": tweets, "handle": handle, "source": "cache_stale"}
            return self._mock_tweets(handle)

        fresh_tweets = self._fetch_from_apify(handle, token)

        # Store in Supabase
        for tweet in fresh_tweets.get("tweets", []):
            try:
                sb.table("tweets").upsert({
                    "id": tweet["id"],
                    "handle": handle,
                    "text": tweet["text"],
                    "created_at": tweet["created_at"],
                    "retweet_count": tweet["retweet_count"],
                    "favorite_count": tweet["favorite_count"],
                    "reply_count": tweet["reply_count"],
                    "fetched_at": now.isoformat(),
                }, on_conflict="id").execute()
            except Exception:
                pass

        # Clean up tweets older than 7 days
        try:
            cutoff = (now - timedelta(days=RETENTION_DAYS)).isoformat()
            sb.table("tweets").delete().eq("handle", handle).lt("created_at", cutoff).execute()
        except Exception:
            pass

        return fresh_tweets

    def _format_tweet(self, row):
        """Convert a Supabase row to our tweet format."""
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

        tweets = []
        for item in items[:3]:
            tweets.append({
                "id": item.get("id", str(time.time())),
                "text": item.get("full_text", item.get("text", "")),
                "created_at": item.get("created_at", ""),
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
