# Delivery roadmap

## Milestone 1 — integrated development baseline (included)

- Separate TTS, ASR, chat, and OCR capability modules.
- Bilingual English/Tamil working interface.
- Deterministic mock providers plus optional Ollama, eSpeak, and Tesseract adapters.
- Consent enforcement, job status, owner-scoped artifacts, idempotency semantics, bounded admission, audit capture, and ASR in-band token refresh contract.
- Catalogue-driven application shell, Usage and Activity History pages, CSV export, durable local interaction records, per-result ratings, data controls, and voluntary sign-out feedback.
- PostgreSQL/pgvector, Redis AOF, and MinIO development infrastructure definitions.
- Automated API, policy, type, lint, and production-build validation.

## Milestone 2 — durable platform layer

- Replace in-process job, idempotency, session and audit stores and the local SQLite record store with PostgreSQL and Redis repositories.
- Add Redis Streams audit batching, retry policies, dead-letter isolation, and partition maintenance.
- Move artifacts to object storage and implement consent-withdrawal deletion plus verification sweeps.
- Add OIDC Authorization Code + PKCE and validate refreshed WebSocket tokens in-band.

## Milestone 3 — approved model services

- Register production TTS, ASR, chat, and OCR providers through an operator approval API.
- Add Tamil/English evaluation datasets, quality thresholds, latency budgets, and resource envelopes.
- Add per-task deadlines, cancellation propagation, circuit breakers, and Redis-degradation runbooks.

## Milestone 4 — retrieval and production evidence

- Add versioned embedding collections with dynamic dimensions and HNSW indexes.
- Implement blue/green collection migration and the Recall@10, MRR, latency, and build-time gates.
- Complete observability, security testing, DPIA evidence, recovery drills, and release acceptance records.
