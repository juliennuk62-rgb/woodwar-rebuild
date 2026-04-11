"""
Send a rich Discord embed notification.

Called by the nightly improvement agent at each phase of its run so the
human watching the Discord channel can follow along in real time. Uses
only the stdlib so it works in any container without dependencies.

Usage (CLI):

    python scripts/discord_notify.py \\
        --webhook "$DISCORD_URL" \\
        --title "Phase 1 — State read" \\
        --description "Night log has 3 entries. Last playtest: yellow (1 blocker)." \\
        --color blue \\
        --field "Branch=claude/intelligent-cerf-gFFaq" \\
        --field "Tests=41/41 green" \\
        --footer "Woodwar nightly improver"

If the webhook is not reachable, the script prints a warning to stderr and
exits 0 — a broken notification never crashes a run.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone


# Map human-friendly names to Discord embed color ints.
COLORS = {
    "blue":    0x3498db,  # info, phase start
    "green":   0x2ecc71,  # success
    "yellow":  0xf1c40f,  # warning, in progress
    "red":     0xe74c3c,  # error, revert
    "purple":  0x9b59b6,  # summary, report
    "gray":    0x95a5a6,  # neutral
    "gold":    0xf39c12,  # milestone
}


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def build_embed(
    title: str,
    description: str | None,
    color_name: str,
    fields: list[str],
    footer: str | None,
) -> dict:
    color = COLORS.get(color_name.lower(), COLORS["gray"])
    embed: dict = {
        "title": title[:256],
        "color": color,
        "timestamp": _iso_now(),
    }
    if description:
        # Discord limit is 4096 chars on description.
        embed["description"] = description[:4000]
    if fields:
        parsed_fields = []
        for f in fields:
            if "=" not in f:
                continue
            name, _, value = f.partition("=")
            parsed_fields.append({
                "name": name.strip()[:256],
                "value": value.strip()[:1024] or "—",
                "inline": True,
            })
        if parsed_fields:
            embed["fields"] = parsed_fields[:25]
    if footer:
        embed["footer"] = {"text": footer[:2048]}
    return embed


def send(webhook: str, embed: dict, content: str | None = None) -> int:
    payload: dict = {"embeds": [embed]}
    if content:
        payload["content"] = content[:2000]

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        webhook,
        data=data,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Woodwar-nightly-improver/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.getcode()
    except urllib.error.HTTPError as e:
        sys.stderr.write(
            f"[discord_notify] HTTP {e.code}: {e.reason} — body: {e.read().decode('utf-8', 'replace')[:500]}\n"
        )
        return e.code
    except (urllib.error.URLError, OSError) as e:
        sys.stderr.write(f"[discord_notify] Network error: {e}\n")
        return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--webhook",
        default=os.environ.get("DISCORD_WEBHOOK_URL", ""),
        help="Discord webhook URL (or DISCORD_WEBHOOK_URL env var)",
    )
    ap.add_argument("--title", required=True, help="Embed title")
    ap.add_argument("--description", default="", help="Embed description")
    ap.add_argument(
        "--color",
        default="blue",
        choices=sorted(COLORS.keys()),
        help="Embed color (semantic name)",
    )
    ap.add_argument(
        "--field",
        action="append",
        default=[],
        help="Field in 'name=value' format (may be repeated)",
    )
    ap.add_argument(
        "--footer",
        default="Woodwar nightly improver",
        help="Footer text",
    )
    ap.add_argument(
        "--content",
        default=None,
        help="Plain text content above the embed (optional)",
    )
    args = ap.parse_args()

    if not args.webhook:
        sys.stderr.write("[discord_notify] No webhook URL provided — skipping.\n")
        return 0

    embed = build_embed(
        title=args.title,
        description=args.description or None,
        color_name=args.color,
        fields=args.field,
        footer=args.footer,
    )

    code = send(args.webhook, embed, content=args.content)
    if 200 <= code < 300:
        sys.stderr.write(f"[discord_notify] OK ({code})\n")
        return 0
    sys.stderr.write(f"[discord_notify] Failed ({code}) — continuing anyway\n")
    return 0  # never crash the parent run


if __name__ == "__main__":
    sys.exit(main())
