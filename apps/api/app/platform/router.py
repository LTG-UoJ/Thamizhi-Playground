import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from fastapi.responses import FileResponse

from app.core import accounts
from app.core.errors import DomainError
from pydantic import BaseModel
from app.core.dependencies import Container, get_container
from app.core.security import Actor, admin_actor, consented_actor, current_actor
from app.platform.models import (
    ExperienceFeedbackRequest,
    InteractionFeedbackRequest,
    ModuleDescriptorRequest,
)

router = APIRouter(tags=["platform"])


@router.get("/me")
async def me(actor: Annotated[Actor, Depends(current_actor)]) -> dict[str, object]:
    return {
        "user_id": actor.user_id,
        "display_name": (await asyncio.to_thread(accounts.get_profile, actor.user_id) or {}).get("display_name", actor.user_id.split("@")[0]),
        "roles": sorted(actor.roles),
        "is_admin": "platform_admin" in actor.roles,
    }


class ProfileUpdate(BaseModel):
    display_name: str


@router.patch("/me/profile")
async def update_profile(
    body: ProfileUpdate,
    actor: Annotated[Actor, Depends(current_actor)],
) -> dict[str, object]:
    try:
        return await asyncio.to_thread(
            accounts.update_display_name, actor.user_id, body.display_name
        )
    except ValueError as exc:
        raise DomainError("INVALID_REQUEST", str(exc), 400) from exc
    except LookupError as exc:
        raise DomainError("NOT_FOUND", str(exc), 404) from exc


@router.get("/modules")
async def modules(
    actor: Annotated[Actor, Depends(current_actor)],
    container: Annotated[Container, Depends(get_container)],
) -> dict[str, object]:
    return {"modules": await container.records.list_modules(), "catalogue_version": "1.0"}


@router.post("/admin/modules", status_code=201)
async def create_module(
    request: ModuleDescriptorRequest,
    actor: Annotated[Actor, Depends(admin_actor)],
    container: Annotated[Container, Depends(get_container)],
) -> dict[str, object]:
    descriptor = await container.records.create_module(request.model_dump(), actor.user_id)
    await container.audit.record(
        actor_id=actor.user_id,
        action="module.create",
        target_type="module",
        target_id=request.module_id,
        outcome="draft",
    )
    return {"module": descriptor, "state": "draft"}


@router.post("/admin/modules/{module_id}/activate")
async def activate_module(
    module_id: str,
    actor: Annotated[Actor, Depends(admin_actor)],
    container: Annotated[Container, Depends(get_container)],
) -> dict[str, object]:
    descriptor = await container.records.activate_module(module_id, actor.user_id)
    await container.audit.record(
        actor_id=actor.user_id,
        action="module.activate",
        target_type="module",
        target_id=module_id,
        outcome="active",
    )
    return {"module": descriptor, "state": "active"}


@router.get("/usage/summary")
async def usage_summary(
    actor: Annotated[Actor, Depends(admin_actor)],
    container: Annotated[Container, Depends(get_container)],
    module_id: Annotated[str | None, Query()] = None,
) -> dict[str, object]:
    return await container.records.usage_summary(actor.user_id, module_id=module_id)


@router.get("/usage/export.csv")
async def usage_export(
    actor: Annotated[Actor, Depends(admin_actor)],
    container: Annotated[Container, Depends(get_container)],
    module_id: Annotated[str | None, Query()] = None,
) -> Response:
    content = await container.records.usage_csv(actor.user_id, module_id=module_id)
    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="thamizhi-usage.csv"'},
    )


@router.get("/activity/me")
async def activity_history(
    actor: Annotated[Actor, Depends(admin_actor)],
    container: Annotated[Container, Depends(get_container)],
    module_id: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
) -> dict[str, object]:
    return {
        "interactions": await container.records.list_interactions(
            actor.user_id, module_id=module_id, limit=limit
        )
    }


@router.get("/activity/admin")
async def admin_activity_history(
    actor: Annotated[Actor, Depends(admin_actor)],
    container: Annotated[Container, Depends(get_container)],
    module_id: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
) -> dict[str, object]:
    return {
        "interactions": await container.records.list_admin_activity(
            module_id=module_id, limit=limit
        )
    }

@router.get("/activity/api")
async def admin_api_history(
    actor: Annotated[Actor, Depends(admin_actor)],
    container: Annotated[Container, Depends(get_container)],
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
) -> dict[str, object]:
    events = await container.records.list_admin_api_history(limit=limit)

    # Resolve each user's saved Google/profile display name.
    user_ids = {event["user_id"] for event in events if event.get("user_id")}
    profiles = {}

    for user_id in user_ids:
        profile = await asyncio.to_thread(accounts.get_profile, user_id)
        profiles[user_id] = (
            profile.get("display_name") if profile else None
        )

    for event in events:
        user_id = event.get("user_id")
        event["user_name"] = profiles.get(user_id) or user_id or "Anonymous"

    return {"events": events}



@router.post("/interactions/{interaction_id}/feedback", status_code=201)
async def interaction_feedback(
    interaction_id: str,
    request: InteractionFeedbackRequest,
    actor: Annotated[Actor, Depends(current_actor)],
    container: Annotated[Container, Depends(get_container)],
) -> dict[str, str]:
    label_id = await container.records.add_interaction_feedback(
        actor.user_id, interaction_id, request.rating, request.comment
    )
    return {"label_id": label_id, "status": "recorded"}


@router.post("/feedback/experience", status_code=201)
async def experience_feedback(
    request: ExperienceFeedbackRequest,
    actor: Annotated[Actor, Depends(current_actor)],
    container: Annotated[Container, Depends(get_container)],
) -> dict[str, str]:
    feedback_id = await container.records.save_experience_feedback(
        user_id=actor.user_id,
        session_id_hash=request.session_id_hash,
        rating=request.rating,
        task_outcome=request.task_outcome,
        module_ids=list(request.module_ids),
        comment=request.comment,
        follow_up_allowed=request.follow_up_allowed,
        locale=request.locale,
        client_version=request.client_version,
    )
    return {"feedback_id": feedback_id, "status": "recorded"}


@router.post("/auth/logout")
async def logout(
    actor: Annotated[Actor, Depends(current_actor)],
    container: Annotated[Container, Depends(get_container)],
) -> dict[str, str]:
    await container.audit.record(
        actor_id=actor.user_id,
        action="session.logout",
        target_type="session",
        target_id="current",
        outcome="completed",
    )
    return {"status": "signed_out"}


@router.get("/providers/capabilities")
async def capabilities(
    actor: Annotated[Actor, Depends(consented_actor)],
    container: Annotated[Container, Depends(get_container)],
) -> dict[str, object]:
    return {
        "capabilities": [
            {
                "capability": "tts",
                "provider_id": container.tts.provider.provider_id,
                "languages": ["en", "ta-LK"],
                "streaming": False,
            },
            {
                "capability": "asr",
                "provider_id": container.asr.provider.provider_id,
                "languages": ["en", "ta-LK"],
                "streaming": True,
            },
            {
                "capability": "chat",
                "provider_id": container.chat.provider.provider_id,
                "model_id": container.chat.provider.model_id,
                "languages": ["en", "ta-LK"],
                "streaming": True,
            },
            {
                "capability": "ocr",
                "provider_id": container.ocr.provider.provider_id,
                "languages": ["en", "ta-LK"],
                "streaming": False,
            },
            {
                "capability": "completion",
                "provider_id": container.completion.provider.provider_id,
                "model_id": container.completion.provider.model_id,
                "languages": ["en", "ta-LK", "si"],
                "streaming": False,
            },
        ]
    }


@router.get("/jobs/{job_id}")
async def get_job(
    job_id: str,
    actor: Annotated[Actor, Depends(consented_actor)],
    container: Annotated[Container, Depends(get_container)],
) -> dict[str, object]:
    return await container.jobs.get(job_id, actor.user_id)


@router.get("/artifacts/{artifact_id}")
async def download_artifact(
    artifact_id: str,
    actor: Annotated[Actor, Depends(consented_actor)],
    container: Annotated[Container, Depends(get_container)],
) -> FileResponse:
    path = container.artifacts.resolve(artifact_id)
    return FileResponse(path, media_type="audio/wav", filename=path.name)


@router.get("/audit/me")
async def my_audit_events(
    actor: Annotated[Actor, Depends(admin_actor)],
    container: Annotated[Container, Depends(get_container)],
) -> dict[str, object]:
    return {"events": await container.audit.list_for_actor(actor.user_id)}


@router.get("/operations/admission")
async def admission_snapshot(
    actor: Annotated[Actor, Depends(admin_actor)],
    container: Annotated[Container, Depends(get_container)],
) -> dict[str, object]:
    return {"queues": await container.admission.snapshot()}


@router.get("/activity/admin/io")
async def admin_recorded_io(
    actor: Annotated[Actor, Depends(admin_actor)],
    container: Annotated[Container, Depends(get_container)],
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
) -> dict[str, object]:
    return {
        "interactions": await container.records.list_admin_recorded_io(limit=limit)
    }
