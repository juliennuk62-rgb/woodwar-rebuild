"""
Tiny cross-cutting helpers used by app.py / game_logic.py / models.py.

The main export is `utcnow()`, a drop-in replacement for
`datetime.datetime.utcnow()` that:

- Emits no DeprecationWarning on Python 3.12+
- Returns a NAIVE datetime (no tzinfo), to stay compatible with the
  existing SQLAlchemy `DateTime` columns which do not use `timezone=True`
- Reads the UTC instant authoritatively via `datetime.now(timezone.utc)`

Using a project-wide helper lets us migrate the 40-ish scattered calls
with a single `replace_all` per file and swap the implementation later
(e.g. to tz-aware datetimes) without touching every call site.
"""
from __future__ import annotations

from datetime import datetime, timezone


def utcnow() -> datetime:
    """Return the current UTC instant as a naive datetime.

    Equivalent to the deprecated `datetime.utcnow()` but recommended
    on Python 3.12+. Strips the tzinfo so it matches what the SQLAlchemy
    `DateTime` columns in models.py store (they are all naive UTC).
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)
