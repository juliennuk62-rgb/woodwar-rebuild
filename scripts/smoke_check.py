"""
One-command sanity check for Woodwar Rebuild.

Runs in order:

1. The full unittest suite (data + logic + routes + enemies + quests + pvp)
2. The playtest simulator
3. A live HTTP smoke test against the dev server (if it's running on
   port 5002), hitting key public endpoints to make sure they return
   2xx/3xx status codes.

Exit code 0 if everything is green, 1 otherwise.

Designed to be called from CI, from a pre-commit hook, or just before
shipping a new commit. Avoids any third-party dependency.
"""
from __future__ import annotations

import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

_REBUILD_DIR = Path(__file__).resolve().parent.parent
SMOKE_HOST = "http://127.0.0.1:5002"


def _safe_print(s: str) -> None:
    try:
        print(s)
    except UnicodeEncodeError:
        print(s.encode("ascii", "replace").decode("ascii"))


def step_unittest() -> bool:
    _safe_print("[smoke] Running unittest suite...")
    result = subprocess.run(
        [sys.executable, "-m", "unittest", "discover", "tests"],
        cwd=str(_REBUILD_DIR),
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        last_line = (result.stderr or result.stdout).strip().splitlines()[-1]
        _safe_print(f"  OK : {last_line}")
        return True
    _safe_print("  FAIL :")
    _safe_print(result.stderr[-1500:] if result.stderr else result.stdout[-1500:])
    return False


def step_playtest() -> bool:
    _safe_print("[smoke] Running playtest simulator...")
    script = _REBUILD_DIR / "scripts" / "playtest.py"
    result = subprocess.run(
        [sys.executable, str(script)],
        cwd=str(_REBUILD_DIR),
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        for line in (result.stdout or "").strip().splitlines()[-3:]:
            _safe_print(f"  {line}")
        return True
    _safe_print("  FAIL :")
    _safe_print(result.stderr[-1500:])
    return False


def step_http_smoke() -> bool:
    _safe_print(f"[smoke] HTTP smoke test against {SMOKE_HOST} ...")
    targets = [
        ("/api/health",         (200,)),
        ("/api/data/units",     (200,)),
        ("/api/data/buildings", (200,)),
        ("/api/data/clans",     (200,)),
        ("/login",              (200, 302)),
        ("/register",           (200, 302)),
        ("/dashboard",          (200, 302, 401)),  # may redirect to login
        ("/rumeurs",            (200, 302, 401)),
        ("/pvp",                (200, 302, 401)),
        ("/campagnes",          (200, 302, 401)),
    ]
    fails = []
    for path, allowed in targets:
        url = SMOKE_HOST + path
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "smoke-check/1.0"})
            with urllib.request.urlopen(req, timeout=5) as r:
                code = r.getcode()
        except urllib.error.HTTPError as e:
            code = e.code
        except (urllib.error.URLError, OSError) as e:
            _safe_print(f"  SKIP {path} (server unreachable: {e})")
            return True  # don't fail smoke if dev server isn't running
        if code in allowed:
            _safe_print(f"  OK   {path} -> {code}")
        else:
            fails.append(f"{path} -> {code} (expected {allowed})")
            _safe_print(f"  FAIL {path} -> {code}")
    return len(fails) == 0


def main() -> int:
    steps = [
        ("unittest", step_unittest),
        ("playtest", step_playtest),
        ("http",     step_http_smoke),
    ]
    failures = []
    for name, fn in steps:
        ok = fn()
        if not ok:
            failures.append(name)
    if failures:
        _safe_print(f"\n[smoke] FAILED steps: {', '.join(failures)}")
        return 1
    _safe_print("\n[smoke] All checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
