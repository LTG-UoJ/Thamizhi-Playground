from collections.abc import Awaitable, Callable
from time import perf_counter
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from app.core.config import get_settings
from app.core.dependencies import get_container
from app.core.errors import DomainError, domain_error_handler
from app.modules.asr.router import router as asr_router
from app.modules.chat.router import router as chat_router
from app.modules.completion.router import router as completion_router
from app.modules.ocr.router import router as ocr_router
from app.modules.tts.router import router as tts_router
from app.platform.router import router as platform_router

settings = get_settings()
app = FastAPI(
    title="Modular AI Playground API",
    version="0.2.0",
    description="Modular TTS, ASR, chat, and OCR gateway based on specification v1.7.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=[
        "Content-Type",
        "Idempotency-Key",
        "X-User-ID",
        "X-Consent-Granted",
        "X-Roles",
        "X-Save-History",
        "X-Improvement-Consent",
    ],
)


async def handle_domain_error(request: Request, error: Exception) -> JSONResponse:
    if not isinstance(error, DomainError):
        raise error
    return await domain_error_handler(request, error)


app.add_exception_handler(DomainError, handle_domain_error)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, error: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "The request did not satisfy the API contract.",
                "request_id": getattr(request.state, "request_id", "unknown"),
                "retryable": False,
                "details": error.errors(),
            }
        },
    )


@app.middleware("http")
async def request_context(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    request_id = request.headers.get("X-Request-ID") or f"req_{uuid4().hex}"
    request.state.request_id = request_id
    started = perf_counter()
    response: Response | None = None
    try:
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response
    finally:
        if request.url.path.startswith("/api/"):
            await get_container().records.record_access(
                user_id=request.headers.get("X-User-ID"),
                method=request.method,
                route=request.url.path,
                status_code=response.status_code if response else 500,
                latency_ms=(perf_counter() - started) * 1_000,
                request_id=request_id,
            )


@app.get("/", include_in_schema=False)
async def root() -> dict[str, str]:
    return {
        "name": "Thamizhi AI Playground API",
        "version": app.version,
        "documentation": "/docs",
        "health": "/health/ready",
    }


@app.get("/health/live", tags=["health"])
async def live() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/ready", tags=["health"])
async def ready() -> dict[str, str]:
    get_container()
    return {"status": "ready"}


for capability_router in (platform_router, tts_router, asr_router, chat_router, ocr_router, completion_router):
    app.include_router(capability_router, prefix="/api/v1")
