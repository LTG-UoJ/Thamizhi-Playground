import asyncio
import csv
import io
import json
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.core.errors import DomainError


@dataclass(frozen=True, slots=True)
class RecordingPolicy:
    save_history: bool = False
    improvement_consent: bool = False


MODULES: tuple[dict[str, Any], ...] = (
    {
        "module_id": "tts",
        "descriptor_version": "1.0",
        "capability": "tts",
        "route_slug": "text-to-speech",
        "navigation_group": "ai_modules",
        "title_key": "modules.tts.title",
        "description_key": "modules.tts.description",
        "icon_key": "audio-lines",
        "sort_order": 10,
        "enabled": True,
        "renderer_kind": "compiled_custom",
        "provider_capability": "tts",
    },
    {
        "module_id": "asr",
        "descriptor_version": "1.0",
        "capability": "asr",
        "route_slug": "speech-to-text",
        "navigation_group": "ai_modules",
        "title_key": "modules.asr.title",
        "description_key": "modules.asr.description",
        "icon_key": "mic",
        "sort_order": 20,
        "enabled": True,
        "renderer_kind": "compiled_custom",
        "provider_capability": "asr",
    },
    {
        "module_id": "chat",
        "descriptor_version": "1.0",
        "capability": "chat",
        "route_slug": "chat",
        "navigation_group": "ai_modules",
        "title_key": "modules.chat.title",
        "description_key": "modules.chat.description",
        "icon_key": "message-circle",
        "sort_order": 30,
        "enabled": True,
        "renderer_kind": "compiled_custom",
        "provider_capability": "chat",
    },
    {
        "module_id": "ocr",
        "descriptor_version": "1.0",
        "capability": "ocr",
        "route_slug": "ocr",
        "navigation_group": "ai_modules",
        "title_key": "modules.ocr.title",
        "description_key": "modules.ocr.description",
        "icon_key": "scan-text",
        "sort_order": 40,
        "enabled": True,
        "renderer_kind": "compiled_custom",
        "provider_capability": "ocr",
    },
    {
        "module_id": "completion",
        "descriptor_version": "1.0",
        "capability": "completion",
        "route_slug": "completion",
        "navigation_group": "ai_modules",
        "title_key": "modules.completion.title",
        "description_key": "modules.completion.description",
        "icon_key": "type",
        "sort_order": 50,
        "enabled": True,
        "renderer_kind": "compiled_custom",
        "provider_capability": "completion",
    },
)


class RecordStore:
    """Durable local record store for the runnable single-node baseline.

    PostgreSQL remains the production target in the specification and SQL schema. SQLite keeps
    the local developer experience genuinely persistent without requiring Docker.
    """

    def __init__(self, path: Path) -> None:
        self.path = path.resolve()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._connection = sqlite3.connect(self.path, check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        self._lock = asyncio.Lock()
        self._migrate()

    def _migrate(self) -> None:
        self._connection.executescript(
            """
            PRAGMA journal_mode=WAL;
            PRAGMA foreign_keys=ON;

            CREATE TABLE IF NOT EXISTS access_events (
                event_id TEXT PRIMARY KEY,
                user_id TEXT,
                method TEXT NOT NULL,
                route TEXT NOT NULL,
                status_code INTEGER NOT NULL,
                latency_ms REAL NOT NULL,
                request_id TEXT NOT NULL,
                occurred_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS access_events_user_time
                ON access_events(user_id, occurred_at DESC);

            CREATE TABLE IF NOT EXISTS inference_interactions (
                interaction_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                module_id TEXT NOT NULL,
                query_text TEXT,
                answer_text TEXT,
                provider_id TEXT,
                model_id TEXT,
                language TEXT NOT NULL,
                status TEXT NOT NULL,
                save_history INTEGER NOT NULL DEFAULT 0,
                improvement_consent INTEGER NOT NULL DEFAULT 0,
                retention_expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS interactions_owner_time
                ON inference_interactions(user_id, created_at DESC);

            CREATE TABLE IF NOT EXISTS interaction_labels (
                label_id TEXT PRIMARY KEY,
                interaction_id TEXT NOT NULL REFERENCES inference_interactions(interaction_id)
                    ON DELETE CASCADE,
                user_id TEXT NOT NULL,
                rating TEXT NOT NULL,
                comment TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS experience_feedback (
                feedback_id TEXT PRIMARY KEY,
                user_id TEXT,
                session_id_hash TEXT,
                rating INTEGER,
                task_outcome TEXT,
                module_ids TEXT NOT NULL,
                comment TEXT,
                follow_up_allowed INTEGER NOT NULL DEFAULT 0,
                locale TEXT NOT NULL,
                client_version TEXT,
                submitted_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS module_definitions (
                module_id TEXT PRIMARY KEY,
                descriptor TEXT NOT NULL,
                state TEXT NOT NULL CHECK (state IN ('draft', 'active', 'disabled')),
                created_by TEXT,
                approved_by TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            """
        )
        now = datetime.now(UTC).isoformat()
        for descriptor in MODULES:
            self._connection.execute(
                """INSERT OR IGNORE INTO module_definitions
                (module_id, descriptor, state, created_by, approved_by, created_at, updated_at)
                VALUES (?, ?, 'active', 'system', 'system', ?, ?)""",
                (descriptor["module_id"], json.dumps(descriptor), now, now),
            )
        self._connection.commit()

    async def list_modules(self, *, include_inactive: bool = False) -> list[dict[str, Any]]:
        query = "SELECT descriptor, state FROM module_definitions"
        if not include_inactive:
            query += " WHERE state = 'active'"
        async with self._lock:
            rows = self._connection.execute(query).fetchall()
        modules: list[dict[str, Any]] = []
        for row in rows:
            descriptor = dict(json.loads(row["descriptor"]))
            descriptor["enabled"] = row["state"] == "active"
            modules.append(descriptor)
        return sorted(modules, key=lambda item: (int(item["sort_order"]), item["module_id"]))

    async def create_module(self, descriptor: dict[str, Any], creator_id: str) -> dict[str, Any]:
        now = datetime.now(UTC).isoformat()
        descriptor = {**descriptor, "enabled": False}
        try:
            async with self._lock:
                self._connection.execute(
                    """INSERT INTO module_definitions
                    (module_id, descriptor, state, created_by, created_at, updated_at)
                    VALUES (?, ?, 'draft', ?, ?, ?)""",
                    (
                        descriptor["module_id"],
                        json.dumps(descriptor),
                        creator_id,
                        now,
                        now,
                    ),
                )
                self._connection.commit()
        except sqlite3.IntegrityError as exc:
            raise DomainError("CONFLICT", "A module with this ID already exists.", 409) from exc
        return descriptor

    async def activate_module(
        self, module_id: str, approver_id: str
    ) -> dict[str, Any]:
        async with self._lock:
            row = self._connection.execute(
                "SELECT descriptor, created_by FROM module_definitions WHERE module_id = ?",
                (module_id,),
            ).fetchone()
            if not row:
                raise DomainError("NOT_FOUND", "Module definition not found.", 404)
            if row["created_by"] == approver_id:
                raise DomainError(
                    "INDEPENDENT_APPROVAL_REQUIRED",
                    "A different administrator must approve this module.",
                    409,
                )
            descriptor = dict(json.loads(row["descriptor"]))
            descriptor["enabled"] = True
            self._connection.execute(
                """UPDATE module_definitions
                SET descriptor = ?, state = 'active', approved_by = ?, updated_at = ?
                WHERE module_id = ?""",
                (
                    json.dumps(descriptor),
                    approver_id,
                    datetime.now(UTC).isoformat(),
                    module_id,
                ),
            )
            self._connection.commit()
        return descriptor

    async def record_access(
        self,
        *,
        user_id: str | None,
        method: str,
        route: str,
        status_code: int,
        latency_ms: float,
        request_id: str,
    ) -> None:
        async with self._lock:
            self._connection.execute(
                """INSERT INTO access_events
                (event_id, user_id, method, route, status_code, latency_ms, request_id, occurred_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    str(uuid4()),
                    user_id,
                    method,
                    route,
                    status_code,
                    round(latency_ms, 2),
                    request_id,
                    datetime.now(UTC).isoformat(),
                ),
            )
            self._connection.commit()

    async def create_interaction(
        self,
        *,
        user_id: str,
        module_id: str,
        query_text: str | None,
        answer_text: str | None,
        provider_id: str | None,
        model_id: str | None,
        language: str,
        policy: RecordingPolicy,
        interaction_id: str | None = None,
        status: str = "completed",
    ) -> str | None:
        if not policy.save_history and not policy.improvement_consent:
            return None
        now = datetime.now(UTC)
        retention = now + timedelta(days=180 if policy.improvement_consent else 30)
        next_id = interaction_id or str(uuid4())
        async with self._lock:
            self._connection.execute(
                """INSERT OR REPLACE INTO inference_interactions
                (interaction_id, user_id, module_id, query_text, answer_text, provider_id,
                 model_id, language, status, save_history, improvement_consent,
                 retention_expires_at, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    next_id,
                    user_id,
                    module_id,
                    query_text,
                    answer_text,
                    provider_id,
                    model_id,
                    language,
                    status,
                    int(policy.save_history),
                    int(policy.improvement_consent),
                    retention.isoformat(),
                    now.isoformat(),
                    now.isoformat(),
                ),
            )
            self._connection.commit()
        return next_id

    async def list_interactions(
        self, user_id: str, *, module_id: str | None = None, limit: int = 100
    ) -> list[dict[str, Any]]:
        query = "SELECT * FROM inference_interactions WHERE user_id = ?"
        params: list[Any] = [user_id]
        if module_id:
            query += " AND module_id = ?"
            params.append(module_id)
        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(min(limit, 100))
        async with self._lock:
            rows = self._connection.execute(query, params).fetchall()
        return [dict(row) for row in rows]

    async def delete_interaction(self, user_id: str, interaction_id: str) -> None:
        async with self._lock:
            cursor = self._connection.execute(
                "DELETE FROM inference_interactions WHERE interaction_id = ? AND user_id = ?",
                (interaction_id, user_id),
            )
            self._connection.commit()
        if cursor.rowcount == 0:
            raise DomainError("NOT_FOUND", "Saved interaction not found.", 404)

    async def add_interaction_feedback(
        self, user_id: str, interaction_id: str, rating: str, comment: str | None
    ) -> str:
        async with self._lock:
            exists = self._connection.execute(
                "SELECT 1 FROM inference_interactions WHERE interaction_id = ? AND user_id = ?",
                (interaction_id, user_id),
            ).fetchone()
            if not exists:
                raise DomainError("NOT_FOUND", "Saved interaction not found.", 404)
            label_id = str(uuid4())
            self._connection.execute(
                """INSERT INTO interaction_labels
                (label_id, interaction_id, user_id, rating, comment, created_at)
                VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    label_id,
                    interaction_id,
                    user_id,
                    rating,
                    comment,
                    datetime.now(UTC).isoformat(),
                ),
            )
            self._connection.commit()
        return label_id

    async def save_experience_feedback(
        self,
        *,
        user_id: str,
        session_id_hash: str | None,
        rating: int | None,
        task_outcome: str | None,
        module_ids: list[str],
        comment: str | None,
        follow_up_allowed: bool,
        locale: str,
        client_version: str | None,
    ) -> str:
        feedback_id = str(uuid4())
        async with self._lock:
            self._connection.execute(
                """INSERT INTO experience_feedback
                (feedback_id, user_id, session_id_hash, rating, task_outcome, module_ids,
                 comment, follow_up_allowed, locale, client_version, submitted_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    feedback_id,
                    user_id,
                    session_id_hash,
                    rating,
                    task_outcome,
                    json.dumps(module_ids),
                    comment,
                    int(follow_up_allowed),
                    locale,
                    client_version,
                    datetime.now(UTC).isoformat(),
                ),
            )
            self._connection.commit()
        return feedback_id

    async def usage_summary(
        self, user_id: str, *, module_id: str | None = None
    ) -> dict[str, Any]:
        clauses = [
            "user_id = ?",
            (
                "(route LIKE '%/tts/%' OR route LIKE '%/asr/%' OR "
                "route LIKE '%/chat/%' OR route LIKE '%/ocr/%' OR "
                "route LIKE '%/completion/%')"
            ),
        ]
        params: list[Any] = [user_id]
        if module_id:
            clauses.append("route LIKE ?")
            params.append(f"%/{module_id}/%")
        where = " AND ".join(clauses)
        async with self._lock:
            totals = self._connection.execute(
                f"""SELECT COUNT(*) AS requests,
                    SUM(CASE WHEN status_code < 400 THEN 1 ELSE 0 END) AS successful,
                    SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS errors,
                    COALESCE(AVG(latency_ms), 0) AS average_latency_ms
                    FROM access_events WHERE {where}""",
                params,
            ).fetchone()
            rows = self._connection.execute(
                f"""SELECT route, COUNT(*) AS requests,
                    SUM(CASE WHEN status_code < 400 THEN 1 ELSE 0 END) AS successful,
                    SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS errors,
                    ROUND(AVG(latency_ms), 2) AS average_latency_ms,
                    MAX(occurred_at) AS last_used_at
                    FROM access_events WHERE {where}
                    GROUP BY route ORDER BY requests DESC, route""",
                params,
            ).fetchall()
        return {
            "totals": {
                "requests": int(totals["requests"] or 0),
                "successful": int(totals["successful"] or 0),
                "errors": int(totals["errors"] or 0),
                "average_latency_ms": round(float(totals["average_latency_ms"] or 0), 2),
            },
            "rows": [dict(row) for row in rows],
            "generated_at": datetime.now(UTC).isoformat(),
        }

    async def usage_csv(self, user_id: str, *, module_id: str | None = None) -> str:
        summary = await self.usage_summary(user_id, module_id=module_id)
        output = io.StringIO()
        writer = csv.DictWriter(
            output,
            fieldnames=[
                "route",
                "requests",
                "successful",
                "errors",
                "average_latency_ms",
                "last_used_at",
            ],
        )
        writer.writeheader()
        writer.writerows(summary["rows"])
        return output.getvalue()


def policy_from_headers(save_history: str | None, improvement_consent: str | None) -> RecordingPolicy:
    return RecordingPolicy(
        save_history=(save_history or "false").lower() == "true",
        improvement_consent=(improvement_consent or "false").lower() == "true",
    )
