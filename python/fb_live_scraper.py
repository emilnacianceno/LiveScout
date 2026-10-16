"""Collect livestream/video URLs from a public Facebook group and save them to JSON.

First run opens a visible browser using a persistent profile (./profile) so you can
log in once; later runs reuse that session.

Usage:
    python fb_live_scraper.py --login
    python fb_live_scraper.py https://www.facebook.com/groups/<group> [--scrolls 30] [--live-only]
(group URL falls back to the GROUP_URL environment variable)
"""
import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright

PROFILE_DIR = Path(__file__).parent / "profile"
DATA_DIR = Path(__file__).parent.parent / "data"

# URL shapes Facebook uses for videos / livestreams
VIDEO_PATTERNS = [
    re.compile(r"/videos/(\d+)"),
    re.compile(r"/watch/live/?\?.*\bv=(\d+)"),
    re.compile(r"/watch/?\?.*\bv=(\d+)"),
    re.compile(r"/reel/(\d+)"),
]

# Runs in the page: returns every video-looking link with its post's text/LIVE flag
EXTRACT_JS = """
() => {
  const out = [];
  for (const a of document.querySelectorAll('a[href]')) {
    const href = a.href;
    if (!/\\/videos\\/\\d+|\\/watch\\/|\\/reel\\/\\d+/.test(href)) continue;
    const post = a.closest('[role="article"]');
    const text = post ? post.innerText : '';
    out.push({href, isLive: /(^|\\n)LIVE(\\n|$)|is live now|\\blive now\\b/i.test(text)});
  }
  return out;
}
"""


def canonical(href: str):
    """Return (video_id, clean_url) or None if href isn't a video link."""
    parsed = urlparse(href)
    full = parsed.path + ("?" + parsed.query if parsed.query else "")
    for pat in VIDEO_PATTERNS:
        m = pat.search(full)
        if m:
            vid = m.group(1)
            if "/reel/" in parsed.path:
                return vid, f"https://www.facebook.com/reel/{vid}"
            if "/videos/" in parsed.path:
                return vid, f"https://www.facebook.com{parsed.path.rstrip('/')}"
            return vid, f"https://www.facebook.com/watch/?v={vid}"
    q = parse_qs(parsed.query)
    if "v" in q and "/watch" in parsed.path:
        vid = q["v"][0]
        return vid, f"https://www.facebook.com/watch/?v={vid}"
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("group_url", nargs="?", default=os.environ.get("GROUP_URL"))
    ap.add_argument("--login", action="store_true", help="open Facebook to log in once, then exit")
    ap.add_argument("--scrolls", type=int, default=30, help="max scroll passes")
    ap.add_argument("--pause", type=float, default=2.5, help="seconds between scrolls")
    ap.add_argument("--live-only", action="store_true", help="keep only posts flagged as LIVE")
    ap.add_argument("--out", default=str(DATA_DIR / "livestreams.json"))
    ap.add_argument("--headless", action="store_true", help="only after you've logged in once")
    args = ap.parse_args()

    if args.login:
        with sync_playwright() as p:
            ctx = p.chromium.launch_persistent_context(str(PROFILE_DIR), headless=False)
            (ctx.pages[0] if ctx.pages else ctx.new_page()).goto("https://www.facebook.com/")
            input("Log in in the browser window, then press Enter here to save the session...")
            try:
                ctx.close()
            except Exception:  # window already closed by the user; the profile is still saved
                pass
        return
    if not args.group_url:
        sys.exit("Provide a group URL or set GROUP_URL.")

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    found = {}  # video_id -> record
    if out_path.exists():  # merge with earlier runs
        try:
            for rec in json.loads(out_path.read_text(encoding="utf-8")):
                found[rec["id"]] = rec
        except (json.JSONDecodeError, KeyError):
            pass

    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            str(PROFILE_DIR), headless=args.headless, viewport={"width": 1280, "height": 900}
        )
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto(args.group_url, wait_until="domcontentloaded")
        page.wait_for_timeout(4000)

        if "login" in page.url or page.locator('input[name="pass"]').count():
            if args.headless:
                sys.exit("Not logged in. Run once without --headless and log in.")
            input("Log in to Facebook in the browser window, then press Enter here...")
            page.goto(args.group_url, wait_until="domcontentloaded")
            page.wait_for_timeout(4000)

        stale = 0
        for i in range(args.scrolls):
            new = 0
            for item in page.evaluate(EXTRACT_JS):
                c = canonical(item["href"])
                if not c:
                    continue
                vid, url = c
                if args.live_only and not item["isLive"]:
                    continue
                if vid not in found:
                    found[vid] = {
                        "id": vid,
                        "url": url,
                        "is_live": item["isLive"],
                        "scraped_at": datetime.now(timezone.utc).isoformat(),
                    }
                    new += 1
                elif item["isLive"]:
                    found[vid]["is_live"] = True
            print(f"scroll {i + 1}/{args.scrolls}: +{new} (total {len(found)})")
            stale = stale + 1 if new == 0 else 0
            if stale >= 5:
                print("No new links after 5 scrolls, stopping.")
                break
            page.mouse.wheel(0, 3000)
            time.sleep(args.pause)

        ctx.close()

    out_path.write_text(json.dumps(list(found.values()), indent=2), encoding="utf-8")
    print(f"Saved {len(found)} URLs to {out_path}")


if __name__ == "__main__":
    main()
