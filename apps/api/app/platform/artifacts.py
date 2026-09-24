import asyncio
from pathlib import Path
from uuid import uuid4

from app.core.errors import DomainError


class ArtifactStore:
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    async def put(self, data: bytes, suffix: str) -> str:
        artifact_id = f"{uuid4()}{suffix}"
        path = self.root / artifact_id
        await asyncio.to_thread(path.write_bytes, data)
        return artifact_id

    def resolve(self, artifact_id: str) -> Path:
        path = (self.root / artifact_id).resolve()
        if path.parent != self.root or not path.is_file():
            raise DomainError("NOT_FOUND", "Artifact not found.", 404)
        return path
