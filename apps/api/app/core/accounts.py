"""User accounts and login sessions (SQLite, same file as the admins table).

Passwords are scrypt-hashed. Session tokens are stored only as SHA-256 hashes.

CLI (run from apps/api):
  python -m app.core.accounts create <user_id> [--admin]   (prompts for password)
  python -m app.core.accounts list
  python -m app.core.accounts delete <user_id>
"""
import getpass
import hashlib
import hmac
import re
import secrets
import sqlite3
import sys
from contextlib import closing
from datetime import datetime, timedelta, timezone

from app.core.config import get_settings

SESSION_HOURS = 12
USER_ID_RE = re.compile(r"^[A-Za-z0-9._@+-]{3,100}$")
ROLES = ("user", "admin")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _connect() -> sqlite3.Connection:
    path = get_settings().admin_database_path
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """CREATE TABLE IF NOT EXISTS users (
               user_id TEXT PRIMARY KEY,
               password_hash TEXT NOT NULL,
               role TEXT NOT NULL DEFAULT 'user',
               disabled INTEGER NOT NULL DEFAULT 0,
               created_at TEXT NOT NULL
           )"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS sessions (
               token_hash TEXT PRIMARY KEY,
               user_id TEXT NOT NULL,
               expires_at TEXT NOT NULL
           )"""
    )
    return conn


def _scrypt(password: str, salt: bytes) -> bytes:
    return hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    return f"scrypt${salt.hex()}${_scrypt(password, salt).hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt_hex, hash_hex = stored.split("$")
        digest = _scrypt(password, bytes.fromhex(salt_hex)).hex()
    except ValueError:
        return False
    return hmac.compare_digest(digest, hash_hex)


def _public(row: sqlite3.Row) -> dict:
    return {
        "user_id": row["user_id"],
        "display_name": row["display_name"] or row["user_id"].split("@")[0],
        "role": row["role"],
        "disabled": bool(row["disabled"]),
        "created_at": row["created_at"],
    }


def _active_admin_count(conn: sqlite3.Connection) -> int:
    return conn.execute(
        "SELECT COUNT(*) FROM users WHERE role = 'admin' AND disabled = 0"
    ).fetchone()[0]


def _guard_last_admin(conn: sqlite3.Connection, user_id: str) -> None:
    row = conn.execute("SELECT role, disabled FROM users WHERE user_id = ?", (user_id,)).fetchone()
    if row and row["role"] == "admin" and not row["disabled"] and _active_admin_count(conn) <= 1:
        raise ValueError("Cannot remove or disable the last active admin.")


def create_user(user_id: str, password: str, role: str = "user") -> dict:
    if not USER_ID_RE.match(user_id):
        raise ValueError("User id must be 3-100 characters: letters, digits, '.', '_', '@', '+' or '-'.")
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters.")
    if role not in ROLES:
        raise ValueError("Role must be 'user' or 'admin'.")
    with closing(_connect()) as conn, conn:
        if conn.execute("SELECT 1 FROM users WHERE user_id = ?", (user_id,)).fetchone():
            raise ValueError("That user id already exists.")
        conn.execute(
            "INSERT INTO users (user_id, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
            (user_id, hash_password(password), role, _now().isoformat()),
        )
    return {"user_id": user_id, "role": role, "disabled": False}


def list_users() -> list[dict]:
    with closing(_connect()) as conn:
        rows = conn.execute("SELECT * FROM users ORDER BY created_at").fetchall()
        return [_public(r) for r in rows]


def update_user(user_id: str, role: str | None = None, disabled: bool | None = None,
                password: str | None = None) -> dict:
    with closing(_connect()) as conn, conn:
        row = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
        if row is None:
            raise LookupError("User not found.")
        if role is not None:
            if role not in ROLES:
                raise ValueError("Role must be 'user' or 'admin'.")
            if role != "admin":
                _guard_last_admin(conn, user_id)
            conn.execute("UPDATE users SET role = ? WHERE user_id = ?", (role, user_id))
        if disabled is not None:
            if disabled:
                _guard_last_admin(conn, user_id)
                conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
            conn.execute("UPDATE users SET disabled = ? WHERE user_id = ?", (int(disabled), user_id))
        if password is not None:
            if len(password) < 8:
                raise ValueError("Password must be at least 8 characters.")
            conn.execute("UPDATE users SET password_hash = ? WHERE user_id = ?",
                         (hash_password(password), user_id))
            conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        row = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
        return _public(row)


def delete_user(user_id: str) -> None:
    with closing(_connect()) as conn, conn:
        if conn.execute("SELECT 1 FROM users WHERE user_id = ?", (user_id,)).fetchone() is None:
            raise LookupError("User not found.")
        _guard_last_admin(conn, user_id)
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM users WHERE user_id = ?", (user_id,))


def login(user_id: str, password: str) -> tuple[str, dict] | None:
    with closing(_connect()) as conn, conn:
        row = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
        if row is None:
            verify_password(password, hash_password("dummy-password"))  # keep timing similar
            return None
        if row["disabled"] or not verify_password(password, row["password_hash"]):
            return None
        token = secrets.token_urlsafe(32)
        expires = _now() + timedelta(hours=SESSION_HOURS)
        conn.execute("DELETE FROM sessions WHERE expires_at < ?", (_now().isoformat(),))
        conn.execute(
            "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
            (hashlib.sha256(token.encode()).hexdigest(), user_id, expires.isoformat()),
        )
        return token, _public(row)


def user_for_token(token: str) -> dict | None:
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    with closing(_connect()) as conn:
        row = conn.execute(
            """SELECT u.* FROM sessions s JOIN users u ON u.user_id = s.user_id
               WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled = 0""",
            (token_hash, _now().isoformat()),
        ).fetchone()
        return _public(row) if row else None


def revoke_token(token: str) -> None:
    with closing(_connect()) as conn, conn:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?",
                     (hashlib.sha256(token.encode()).hexdigest(),))


if __name__ == "__main__":
    args = sys.argv[1:]
    if args[:1] == ["create"] and len(args) in (2, 3):
        pw = getpass.getpass("Password (min 8 chars): ")
        if pw != getpass.getpass("Repeat password: "):
            sys.exit("Passwords do not match.")
        print(create_user(args[1], pw, "admin" if "--admin" in args[2:] else "user"))
    elif args == ["list"]:
        for u in list_users():
            print(u)
    elif args[:1] == ["delete"] and len(args) == 2:
        delete_user(args[1])
        print(f"deleted {args[1]}")
    else:
        sys.exit(__doc__)


def google_login(email: str, google_sub: str, display_name: str) -> tuple[str, dict] | None:
    email = email.strip().lower()
    google_sub = google_sub.strip()
    display_name = display_name.strip()[:100]

    if not USER_ID_RE.match(email) or not google_sub:
        return None

    with closing(_connect()) as conn, conn:
        row = conn.execute(
            "SELECT * FROM users WHERE google_sub = ?", (google_sub,)
        ).fetchone()

        if row is None:
            existing = conn.execute(
                "SELECT * FROM users WHERE user_id = ?", (email,)
            ).fetchone()

            if existing is not None:
                if existing["password_hash"] != "!":
                    return None

                if existing["google_sub"] is not None:
                    return None

                # Legacy Google-only account: associate it on first
                # successful verified Google sign-in.
                conn.execute(
                    "UPDATE users SET google_sub = ?, display_name = ? WHERE user_id = ?",
                    (google_sub, display_name, email),
                )
            else:
                conn.execute(
                    """INSERT INTO users
                       (user_id, password_hash, role, created_at, google_sub, display_name)
                       VALUES (?, '!', 'user', ?, ?, ?)""",
                    (email, _now().isoformat(), google_sub, display_name),
                )

            row = conn.execute(
                "SELECT * FROM users WHERE google_sub = ?", (google_sub,)
            ).fetchone()

        if row is None or row["disabled"]:
            return None

        token = secrets.token_urlsafe(32)
        expires = _now() + timedelta(hours=SESSION_HOURS)

        conn.execute(
            "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
            (hashlib.sha256(token.encode()).hexdigest(), row["user_id"], expires.isoformat()),
        )

        return token, _public(row)

def get_profile(user_id: str) -> dict | None:
    with closing(_connect()) as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE user_id = ? AND disabled = 0",
            (user_id,),
        ).fetchone()
        return _public(row) if row else None


def update_display_name(user_id: str, display_name: str) -> dict:
    name = display_name.strip()
    if not 1 <= len(name) <= 100:
        raise ValueError("Display name must be 1–100 characters.")

    with closing(_connect()) as conn, conn:
        result = conn.execute(
            "UPDATE users SET display_name = ? WHERE user_id = ? AND disabled = 0",
            (name, user_id),
        )
        if result.rowcount == 0:
            raise LookupError("Account not found.")

    profile = get_profile(user_id)
    if profile is None:
        raise LookupError("Account not found.")
    return profile
