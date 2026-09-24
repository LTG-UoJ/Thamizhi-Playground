from functools import lru_cache

from app.core.config import get_settings
from app.modules.asr.service import ASRService, build_asr_provider
from app.modules.chat.service import ChatService, build_chat_provider
from app.modules.completion.service import CompletionService, build_completion_provider
from app.modules.ocr.service import OCRService, build_ocr_provider
from app.modules.tts.service import TTSService, build_tts_provider
from app.platform.admission import AdmissionController
from app.platform.artifacts import ArtifactStore
from app.platform.audit import AuditStore
from app.platform.idempotency import IdempotencyStore
from app.platform.jobs import JobStore
from app.platform.records import RecordStore


class Container:
    def __init__(self) -> None:
        settings = get_settings()
        self.audit = AuditStore()
        self.idempotency = IdempotencyStore()
        self.admission = AdmissionController(
            limits={"tts": 500, "asr": 100, "chat": 500, "ocr": 500, "completion": 500}
        )
        self.jobs = JobStore()
        self.artifacts = ArtifactStore(settings.artifact_dir)
        self.records = RecordStore(settings.record_database_path)
        self.tts = TTSService(
            build_tts_provider(settings),
            self.jobs,
            self.artifacts,
            self.admission,
            self.audit,
            self.records,
        )
        self.asr = ASRService(
            build_asr_provider(settings), self.jobs, self.admission, self.audit, self.records
        )
        self.chat = ChatService(
            build_chat_provider(settings), self.admission, self.audit, self.records
        )
        self.ocr = OCRService(
            build_ocr_provider(settings), self.jobs, self.admission, self.audit, self.records
        )
        self.completion = CompletionService(
            build_completion_provider(settings), self.admission, self.audit, self.records
        )


@lru_cache
def get_container() -> Container:
    return Container()
