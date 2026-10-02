.PHONY: install api-install web-install api web dev test check

install: api-install web-install

api-install:
	cd apps/api && uv sync --extra dev

web-install:
	cd apps/web && pnpm install

api:
	cd apps/api && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8002

web:
	cd apps/web && pnpm dev

dev:
	$(MAKE) -j2 api web

test:
	cd apps/api && uv run pytest
	cd apps/web && pnpm test

check:
	cd apps/api && uv run ruff check . && uv run mypy app
	cd apps/web && pnpm lint && pnpm typecheck
