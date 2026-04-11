"""
Authentification : hash de mots de passe, sessions, décorateurs.

On utilise Werkzeug pour le hashing (pbkdf2:sha256) et les sessions Flask
pour la persistance (cookies signés).
"""
from __future__ import annotations

from functools import wraps
from pathlib import Path

from flask import g, redirect, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

from db import SessionLocal
from models import User


# ----- Secret key -------------------------------------------------------------

_SECRET_FILE = Path(__file__).parent / ".secret"


def load_or_create_secret() -> bytes:
    """Load the Flask secret key from .secret, creating it if absent."""
    if _SECRET_FILE.exists():
        return _SECRET_FILE.read_bytes()
    import secrets
    key = secrets.token_bytes(32)
    _SECRET_FILE.write_bytes(key)
    return key


# ----- Password hashing -------------------------------------------------------


def hash_password(password: str) -> str:
    return generate_password_hash(password, method="pbkdf2:sha256", salt_length=16)


def verify_password(password_hash: str, password: str) -> bool:
    return check_password_hash(password_hash, password)


# ----- Validation -------------------------------------------------------------


def validate_username(username: str) -> str | None:
    """Return an error message, or None if valid."""
    if not username:
        return "Le pseudo est requis."
    if len(username) < 3:
        return "Le pseudo doit faire au moins 3 caractères."
    if len(username) > 32:
        return "Le pseudo ne peut pas dépasser 32 caractères."
    if not all(c.isalnum() or c in "-_" for c in username):
        return "Le pseudo ne peut contenir que des lettres, chiffres, tirets et underscores."
    return None


def validate_password(password: str) -> str | None:
    if not password:
        return "Le mot de passe est requis."
    if len(password) < 6:
        return "Le mot de passe doit faire au moins 6 caractères."
    if len(password) > 128:
        return "Le mot de passe ne peut pas dépasser 128 caractères."
    return None


# ----- Current user -----------------------------------------------------------


def current_user() -> User | None:
    """Return the currently authenticated User, or None."""
    if "user_id" not in session:
        return None
    # Cache per-request to avoid repeated DB hits.
    if hasattr(g, "_current_user"):
        return g._current_user
    with SessionLocal() as s:
        user = s.get(User, session["user_id"])
        g._current_user = user
        return user


def login_user(user: User) -> None:
    session.clear()
    session["user_id"] = user.id
    session.permanent = True


def logout_user() -> None:
    session.clear()
    if hasattr(g, "_current_user"):
        delattr(g, "_current_user")


# ----- Decorators -------------------------------------------------------------


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if current_user() is None:
            if request.accept_mimetypes.best == "application/json":
                return {"error": "authentication_required"}, 401
            return redirect(url_for("login"))
        return view(*args, **kwargs)

    return wrapper
