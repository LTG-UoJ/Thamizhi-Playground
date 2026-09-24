# Modular AI Playground

An implementation baseline for Technical Specification v1.7. The monorepo separates TTS, ASR, chat, and OCR capabilities while sharing identity, consent, provider routing, idempotency, job, audit, usage, interaction-history, and feedback contracts.

## Repository layout

- `apps/api` — FastAPI gateway and capability modules.
- `apps/web` — bilingual Next.js interface.
- `packages/contracts` — shared API contracts and examples.
- `infra` — local PostgreSQL/pgvector, Redis, and MinIO services.
- `docs` — architecture and implementation notes.

See [`docs/roadmap.md`](docs/roadmap.md) for the explicit boundary between this runnable milestone and the production hardening work that follows.

## Current runnable baseline

The initial slice provides:

- TTS job creation and WAV artifact download using a deterministic mock provider.
- ASR session creation, batch transcription, and a WebSocket control/audio contract.
- JSON and SSE chat completions.
- OCR job creation and structured page/block results.
- development authentication, explicit consent enforcement, idempotency replay/conflict handling, bounded per-capability admission, job status, provider capability discovery, and audit events.
- optional Ollama chat, Tesseract OCR, and eSpeak TTS adapters selected through environment configuration.
- a catalogue-driven workspace matching the supplied interface direction, with Home, Usage, Activity History, responsive navigation, explicit data controls, per-result feedback, CSV usage export, and voluntary sign-out feedback.
- durable local SQLite storage for access metadata, saved queries/answers, improvement consent, and feedback. Raw content is never copied into access or audit logs.
- draft/activate module-registration APIs with role checks and independent approval, allowing future catalogue entries without editing sidebar source code.

Mock providers are intentionally deterministic and are not represented as production-quality AI. They let UI, API, queue, audit, and failure semantics be exercised before model weights are selected.

## Run locally

Prerequisites: Python 3.12+, Node.js 22+, pnpm, and optionally Docker.

```bash
cp .env.example .env
make install
make dev
```

`make dev` starts both processes. Stop them together with `Ctrl+C`. If you prefer separate
terminals, run `make api` in one and `make web` in the other.

The UI is served at `http://localhost:3000`; the API landing response and OpenAPI UI are at `http://localhost:8000` and `http://localhost:8000/docs`. Opening port 8000 shows API information, not the visual application.

To run the complete local stack in containers:

```bash
docker compose -f infra/docker-compose.yml up --build
```

This starts the web interface on port `3000`, the API on port `8000`, PostgreSQL/pgvector, Redis with AOF persistence, and MinIO object storage. Generated artifacts and local interaction records use separate persistent Docker volumes; migration of the application repositories to PostgreSQL/MinIO remains a production-hardening milestone.

Development authentication uses `X-User-ID` and `X-Consent-Granted` headers. The web client supplies these only when `MAP_DEV_AUTH_ENABLED=true`. Replace this mode with the OIDC/session implementation before any shared or production deployment.

## Validation

```bash
make test
make check
```

## Model adapters

Set one provider per capability:

- `MAP_TTS_PROVIDER=mock|espeak`
- `MAP_ASR_PROVIDER=mock`
- `MAP_CHAT_PROVIDER=mock|ollama`
- `MAP_OCR_PROVIDER=mock|tesseract`

ASR deliberately starts with the protocol and mock adapter. A production Whisper/faster-whisper service should be registered through the same provider interface after the required Tamil/English evaluation set and resource budget are approved.
