from uuid import uuid4

from fastapi.testclient import TestClient


def test_health(client: TestClient) -> None:
    assert client.get("/health/live").json() == {"status": "ok"}
    assert client.get("/health/ready").json() == {"status": "ready"}


def test_consent_is_required(client: TestClient) -> None:
    response = client.post(
        "/api/v1/chat/completions",
        headers={"X-User-ID": "test-user", "X-Consent-Granted": "false"},
        json={"messages": [{"role": "user", "content": "Hello"}]},
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "CONSENT_REQUIRED"


def test_tts_job_and_idempotent_replay(client: TestClient, headers: dict[str, str]) -> None:
    request_headers = {**headers, "Idempotency-Key": "same-request-key"}
    payload = {"text": "Hello world", "language": "en"}
    first = client.post("/api/v1/tts/jobs", headers=request_headers, json=payload)
    replay = client.post("/api/v1/tts/jobs", headers=request_headers, json=payload)
    assert first.status_code == 202
    assert replay.status_code == 202
    assert replay.json()["job_id"] == first.json()["job_id"]

    job = client.get(f"/api/v1/jobs/{first.json()['job_id']}", headers=headers)
    assert job.status_code == 200
    assert job.json()["status"] == "completed"
    artifact = client.get(job.json()["result"]["artifact_url"], headers=headers)
    assert artifact.status_code == 200
    assert artifact.content.startswith(b"RIFF")


def test_idempotency_conflict(client: TestClient, headers: dict[str, str]) -> None:
    request_headers = {**headers, "Idempotency-Key": "conflict-request-key"}
    client.post("/api/v1/tts/jobs", headers=request_headers, json={"text": "one"})
    response = client.post("/api/v1/tts/jobs", headers=request_headers, json={"text": "two"})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"


def test_chat_completion(client: TestClient, headers: dict[str, str]) -> None:
    response = client.post(
        "/api/v1/chat/completions",
        headers=headers,
        json={"messages": [{"role": "user", "content": "Explain morphology"}]},
    )
    assert response.status_code == 200
    assert "Explain morphology" in response.json()["message"]["content"]
    assert response.json()["provider_id"] == "mock-chat"


def test_batch_asr(client: TestClient, headers: dict[str, str]) -> None:
    response = client.post(
        "/api/v1/asr/transcriptions",
        headers=headers,
        data={"language": "ta-LK"},
        files={"audio": ("sample.wav", b"audio-data", "audio/wav")},
    )
    assert response.status_code == 200
    assert response.json()["language"] == "ta-LK"
    assert response.json()["provider_id"] == "mock-asr"


def test_live_asr_accepts_in_band_auth_refresh(
    client: TestClient, headers: dict[str, str]
) -> None:
    session = client.post(
        "/api/v1/asr/sessions",
        headers=headers,
        json={"language": "en"},
    ).json()
    with client.websocket_connect(
        session["stream_url"],
        headers=headers,
    ) as websocket:
        assert websocket.receive_json()["type"] == "ready"
        websocket.send_json({"type": "token_refresh", "token": "replacement-token"})
        assert websocket.receive_json()["type"] == "auth_refreshed"
        websocket.send_bytes(b"audio-data")
        websocket.send_json({"type": "end"})
        assert websocket.receive_json()["type"] == "final"


def test_ocr_job(client: TestClient, headers: dict[str, str]) -> None:
    response = client.post(
        "/api/v1/ocr/jobs",
        headers={**headers, "Idempotency-Key": "ocr-request-key"},
        data={"language": "en"},
        files={"image": ("sample.png", b"not-a-real-image", "image/png")},
    )
    assert response.status_code == 202
    job = client.get(f"/api/v1/jobs/{response.json()['job_id']}", headers=headers)
    assert job.json()["status"] == "completed"
    assert job.json()["result"]["provider_id"] == "mock-ocr"


def test_provider_capabilities(client: TestClient, headers: dict[str, str]) -> None:
    response = client.get("/api/v1/providers/capabilities", headers=headers)
    assert response.status_code == 200
    assert {item["capability"] for item in response.json()["capabilities"]} == {
        "tts",
        "asr",
        "chat",
        "ocr",
        "completion",
    }


def test_module_catalogue(client: TestClient, headers: dict[str, str]) -> None:
    response = client.get("/api/v1/modules", headers=headers)
    assert response.status_code == 200
    modules = response.json()["modules"]
    assert [item["module_id"] for item in modules[:4]] == ["tts", "asr", "chat", "ocr"]
    assert all(item["renderer_kind"] == "compiled_custom" for item in modules[:4])


def test_module_registration_requires_independent_approval(client: TestClient) -> None:
    suffix = uuid4().hex[:8]
    module_id = f"translate-{suffix}"
    payload = {
        "module_id": module_id,
        "capability": "translation",
        "route_slug": module_id,
        "title_key": "modules.translate.title",
        "description_key": "modules.translate.description",
        "icon_key": "languages",
        "provider_capability": "translation",
        "renderer_kind": "standard_form",
    }
    creator = {
        "X-User-ID": "admin-one",
        "X-Consent-Granted": "true",
        "X-Roles": "platform_admin",
    }
    approver = {**creator, "X-User-ID": "admin-two"}
    created = client.post("/api/v1/admin/modules", headers=creator, json=payload)
    assert created.status_code == 201
    assert created.json()["state"] == "draft"
    assert client.post(
        f"/api/v1/admin/modules/{module_id}/activate", headers=creator
    ).status_code == 409
    activated = client.post(
        f"/api/v1/admin/modules/{module_id}/activate", headers=approver
    )
    assert activated.status_code == 200

    catalogue = client.get("/api/v1/modules", headers=approver).json()["modules"]
    assert module_id in {item["module_id"] for item in catalogue}


def test_saved_interaction_feedback_and_deletion(
    client: TestClient, headers: dict[str, str]
) -> None:
    response = client.post(
        "/api/v1/chat/completions",
        headers={**headers, "X-Save-History": "true"},
        json={"messages": [{"role": "user", "content": "A private test query"}]},
    )
    assert response.status_code == 200
    interaction_id = response.json()["interaction_id"]
    assert interaction_id

    history = client.get("/api/v1/activity/me?module_id=chat", headers=headers)
    assert history.status_code == 200
    assert interaction_id in {
        item["interaction_id"] for item in history.json()["interactions"]
    }

    rating = client.post(
        f"/api/v1/interactions/{interaction_id}/feedback",
        headers=headers,
        json={"rating": "helpful"},
    )
    assert rating.status_code == 201

    deleted = client.delete(f"/api/v1/activity/me/{interaction_id}", headers=headers)
    assert deleted.status_code == 204


def test_content_not_saved_without_recording_opt_in(
    client: TestClient, headers: dict[str, str]
) -> None:
    response = client.post(
        "/api/v1/chat/completions",
        headers=headers,
        json={"messages": [{"role": "user", "content": "do-not-retain-marker"}]},
    )
    assert response.status_code == 200
    assert response.json()["interaction_id"] is None


def test_usage_feedback_and_logout(client: TestClient, headers: dict[str, str]) -> None:
    usage = client.get("/api/v1/usage/summary", headers=headers)
    assert usage.status_code == 200
    assert set(usage.json()["totals"]) == {
        "requests",
        "successful",
        "errors",
        "average_latency_ms",
    }

    feedback = client.post(
        "/api/v1/feedback/experience",
        headers=headers,
        json={
            "rating": 5,
            "task_outcome": "yes",
            "module_ids": ["chat"],
            "comment": "Clear and useful",
            "follow_up_allowed": False,
            "locale": "en",
        },
    )
    assert feedback.status_code == 201
    assert client.post("/api/v1/auth/logout", headers=headers).json() == {
        "status": "signed_out"
    }


# ---------------------------------------------------------------------------
# Completion module tests
# ---------------------------------------------------------------------------


def test_completion_requires_consent(client: TestClient) -> None:
    response = client.post(
        "/api/v1/completion/completions",
        headers={"X-User-ID": "test-user", "X-Consent-Granted": "false"},
        json={"text": "The University of Jaffna is"},
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "CONSENT_REQUIRED"


def test_completion_basic(client: TestClient, headers: dict[str, str]) -> None:
    response = client.post(
        "/api/v1/completion/completions",
        headers=headers,
        json={"text": "The University of Jaffna is"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "The University of Jaffna is" in data["text"]
    assert data["provider_id"] == "mock-completion"
    assert data["model_id"] == "deterministic-demo"
    assert "request_id" in data


def test_completion_tamil_input(client: TestClient, headers: dict[str, str]) -> None:
    response = client.post(
        "/api/v1/completion/completions",
        headers=headers,
        json={"text": "இன்று யாழ்ப்பாணத்தில்"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "இன்று யாழ்ப்பாணத்தில்" in data["text"]
    assert data["provider_id"] == "mock-completion"


def test_completion_empty_input_rejected(client: TestClient, headers: dict[str, str]) -> None:
    response = client.post(
        "/api/v1/completion/completions",
        headers=headers,
        json={"text": ""},
    )
    assert response.status_code == 422


def test_completion_interaction_not_saved_without_opt_in(
    client: TestClient, headers: dict[str, str]
) -> None:
    response = client.post(
        "/api/v1/completion/completions",
        headers=headers,
        json={"text": "do-not-retain-marker"},
    )
    assert response.status_code == 200
    assert response.json()["interaction_id"] is None


def test_completion_interaction_saved_with_opt_in(
    client: TestClient, headers: dict[str, str]
) -> None:
    response = client.post(
        "/api/v1/completion/completions",
        headers={**headers, "X-Save-History": "true"},
        json={"text": "A private completion query"},
    )
    assert response.status_code == 200
    interaction_id = response.json()["interaction_id"]
    assert interaction_id

    history = client.get("/api/v1/activity/me?module_id=completion", headers=headers)
    assert history.status_code == 200
    assert interaction_id in {item["interaction_id"] for item in history.json()["interactions"]}


def test_completion_authentication_required(client: TestClient) -> None:
    response = client.post(
        "/api/v1/completion/completions",
        json={"text": "The weather today is"},
    )
    assert response.status_code == 401


def test_module_catalogue_includes_completion(
    client: TestClient, headers: dict[str, str]
) -> None:
    response = client.get("/api/v1/modules", headers=headers)
    assert response.status_code == 200
    module_ids = {item["module_id"] for item in response.json()["modules"]}
    assert "completion" in module_ids


def test_provider_capabilities_includes_completion(
    client: TestClient, headers: dict[str, str]
) -> None:
    response = client.get("/api/v1/providers/capabilities", headers=headers)
    assert response.status_code == 200
    capabilities = {item["capability"] for item in response.json()["capabilities"]}
    assert "completion" in capabilities

