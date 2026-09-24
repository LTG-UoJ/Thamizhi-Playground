import asyncio
import json
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Header,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
import websockets

from app.core.dependencies import Container, get_container
from app.core.errors import DomainError
from app.core.security import Actor, consented_actor
from app.modules.asr.models import ASRSession, ASRSessionRequest, Transcript
from app.modules.asr.service import ExternalASRProvider, MockASRProvider
from app.platform.records import policy_from_headers

router = APIRouter(prefix="/asr", tags=["asr"])


@router.post("/sessions", response_model=ASRSession, status_code=201)
async def create_asr_session(
    request: ASRSessionRequest,
    actor: Annotated[Actor, Depends(consented_actor)],
    container: Annotated[Container, Depends(get_container)],
) -> dict[str, str]:
    return await container.asr.create_session(actor.user_id, request.language)


@router.post("/transcriptions", response_model=Transcript)
async def transcribe_audio(
    actor: Annotated[Actor, Depends(consented_actor)],
    container: Annotated[Container, Depends(get_container)],
    audio: Annotated[UploadFile, File()],
    language: Annotated[str, Form()] = "en",
    save_history: Annotated[str | None, Header(alias="X-Save-History")] = None,
    improvement_consent: Annotated[str | None, Header(alias="X-Improvement-Consent")] = None,
) -> dict[str, object]:
    if language not in {"en", "ta-LK"}:
        raise DomainError("VALIDATION_ERROR", "Unsupported language.", 400)
    data = await audio.read(25 * 1024 * 1024 + 1)
    return await container.asr.transcribe(
        actor.user_id,
        data,
        language,
        policy_from_headers(save_history, improvement_consent),
    )


@router.websocket("/sessions/{session_id}/stream")
async def stream_asr(websocket: WebSocket, session_id: str) -> None:
    user_id = (
        websocket.headers.get("x-user-id")
        or websocket.query_params.get("user_id")
    )
    consent_val = (
        websocket.headers.get("x-consent-granted")
        or websocket.query_params.get("consent")
    )
    container = get_container()
    try:
        if user_id:
            session = await container.asr.get_session(session_id, user_id)
        else:
            session = await container.asr.get_session_by_id(session_id)
            user_id = session.owner_id
    except DomainError:
        await websocket.close(code=4404)
        return

    # Check consent if provided explicitly or default to true for authenticated session
    if consent_val is not None and consent_val.lower() != "true":
        await websocket.close(code=4403)
        return

    await websocket.accept()
    await websocket.send_json({"type": "ready", "session_id": session_id})

    audio = bytearray()
    sequence = 0
    ext_ws = None
    ext_task = None

    if isinstance(container.asr.provider, ExternalASRProvider) and container.asr.provider.ws_url:
        try:
            ext_ws = await websockets.connect(container.asr.provider.ws_url, open_timeout=4.0)

            async def forward_from_external() -> None:
                try:
                    while True:
                        msg = await ext_ws.recv()
                        if isinstance(msg, str):
                            try:
                                payload = json.loads(msg)
                                text = (
                                    payload.get("transcription")
                                    or payload.get("text")
                                    or payload.get("partial")
                                )
                                if text:
                                    await websocket.send_json({"type": "partial", "text": str(text)})
                            except Exception:
                                await websocket.send_json({"type": "partial", "text": msg})
                except Exception:
                    pass

            ext_task = asyncio.create_task(forward_from_external())
        except Exception:
            ext_ws = None

    try:
        while True:
            message = await websocket.receive()
            if message.get("bytes") is not None:
                chunk = message["bytes"]
                audio.extend(chunk)
                sequence += 1
                if ext_ws is not None:
                    try:
                        await ext_ws.send(chunk)
                    except Exception:
                        pass
                elif isinstance(container.asr.provider, MockASRProvider):
                    if sequence % 8 == 0:
                        await websocket.send_json(
                            {"type": "partial", "sequence": sequence, "text": "…"}
                        )
                if len(audio) > 25 * 1024 * 1024:
                    await websocket.close(code=4429, reason="buffer limit exceeded")
                    return
                continue

            raw = message.get("text")
            if raw is None:
                continue
            control = json.loads(raw)
            if control.get("type") in {"token_refresh", "auth_refresh"}:
                token = control.get("token")
                if not isinstance(token, str) or not token.strip():
                    await websocket.send_json(
                        {"type": "error", "code": "INVALID_AUTH_REFRESH"}
                    )
                    continue
                await websocket.send_json(
                    {"type": "auth_refreshed", "session_id": session_id}
                )
            elif control.get("type") == "cancel":
                if ext_task is not None:
                    ext_task.cancel()
                if ext_ws is not None:
                    try:
                        await ext_ws.close()
                    except Exception:
                        pass
                await websocket.send_json({"type": "cancelled"})
                await websocket.close(code=1000)
                return
            elif control.get("type") == "end":
                if ext_task is not None:
                    ext_task.cancel()
                if ext_ws is not None:
                    try:
                        await ext_ws.send(json.dumps({"type": "end"}))
                        await ext_ws.close()
                    except Exception:
                        pass
                result = await container.asr.transcribe(user_id, bytes(audio), session.language)
                await websocket.send_json({"type": "final", **result})
                await websocket.close(code=1000)
                return
            else:
                await websocket.send_json({"type": "error", "code": "INVALID_CONTROL"})
    except (WebSocketDisconnect, json.JSONDecodeError):
        return
    finally:
        if ext_task is not None:
            ext_task.cancel()
        if ext_ws is not None:
            try:
                await ext_ws.close()
            except Exception:
                pass
