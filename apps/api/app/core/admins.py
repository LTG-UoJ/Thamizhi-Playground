"""Database-backed administrator list. Roles are decided here, never by headers.

CLI (run from apps/api):
  python -m app.core.admins add <user_id>
  python -m app.core.admins remove <user_id>
  python -m app.core.admins list
"""
import asyncio
import sqlite3
import sys
from contextlib import closing
from pathlib import Path

from app.core.config import get_settings


def _db_path() -> Path:
    return get_settings().admin_database_path


def _connect() -> sqlite3.Connection:
    path = _db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.execute(
        """CREATE TABLE IF NOT EXISTS admins (
               user_id TEXT PRIMARY KEY,
               created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
           )"""
    )
    return conn


def is_admin_sync(user_id: str) -> bool:
    with closing(_connect()) as conn:
        row = conn.execute("SELECT 1 FROM admins WHERE user_id = ?", (user_id,)).fetchone()
        return row is not None


async def is_admin(user_id: str) -> bool:
    return await asyncio.to_thread(is_admin_sync, user_id)


def add_admin(user_id: str) -> None:
    with closing(_connect()) as conn, conn:
        conn.execute("INSERT OR IGNORE INTO admins (user_id) VALUES (?)", (user_id,))


def remove_admin(user_id: str) -> None:
    with closing(_connect()) as conn, conn:
        conn.execute("DELETE FROM admins WHERE user_id = ?", (user_id,))


def list_admins() -> list[str]:
    with closing(_connect()) as conn:
        return [r[0] for r in conn.execute("SELECT user_id FROM admins ORDER BY user_id")]


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "add" and len(sys.argv) == 3:
        add_admin(sys.argv[2])
        print(f"added {sys.argv[2]}")
    elif cmd == "remove" and len(sys.argv) == 3:
        remove_admin(sys.argv[2])
        print(f"removed {sys.argv[2]}")
    elif cmd == "list":
        print("\n".join(list_admins()) or "(no admins)")
    else:
        sys.exit(__doc__)
