CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE users (
    id uuid PRIMARY KEY,
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'suspended', 'deleted')),
    created_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

CREATE TABLE consents (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    terms_version text NOT NULL,
    privacy_version text NOT NULL,
    locale text NOT NULL CHECK (locale IN ('en', 'ta-LK')),
    accepted_at timestamptz NOT NULL,
    withdrawn_at timestamptz,
    CHECK (withdrawn_at IS NULL OR withdrawn_at >= accepted_at)
);

CREATE UNIQUE INDEX one_active_consent_per_user
    ON consents(user_id) WHERE withdrawn_at IS NULL;

CREATE TABLE provider_registrations (
    id uuid PRIMARY KEY,
    provider_id text NOT NULL,
    capability text NOT NULL CHECK (capability IN ('tts', 'asr', 'chat', 'ocr')),
    provider_class text NOT NULL CHECK (provider_class IN ('local', 'cloud')),
    descriptor jsonb NOT NULL,
    secret_reference text,
    state text NOT NULL DEFAULT 'draft'
        CHECK (state IN ('draft', 'validating', 'pending_approval', 'active', 'suspended', 'rejected', 'retired')),
    created_by uuid NOT NULL REFERENCES users(id),
    approved_by uuid REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider_id, capability)
);

CREATE TABLE jobs (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    capability text NOT NULL CHECK (capability IN ('tts', 'asr', 'chat', 'ocr')),
    task_class text NOT NULL,
    status text NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
    request_fingerprint bytea NOT NULL,
    provider_id text,
    result jsonb,
    error jsonb,
    attempts smallint NOT NULL DEFAULT 0,
    started_at timestamptz,
    deadline_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX jobs_owner_created_idx ON jobs(user_id, created_at DESC);
CREATE INDEX jobs_claim_idx ON jobs(capability, status, created_at)
    WHERE status = 'queued';

CREATE TABLE idempotency_keys (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    route_id text NOT NULL,
    key_hash bytea NOT NULL CHECK (octet_length(key_hash) = 32),
    request_fingerprint bytea NOT NULL,
    state text NOT NULL CHECK (state IN ('in_progress', 'completed', 'failed')),
    response_status smallint,
    result_ref uuid,
    replay_envelope bytea,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    PRIMARY KEY (user_id, route_id, key_hash),
    CHECK (expires_at >= created_at + interval '24 hours'),
    CHECK (expires_at <= created_at + interval '72 hours'),
    CHECK (replay_envelope IS NULL OR octet_length(replay_envelope) <= 65536)
);

CREATE INDEX idempotency_keys_expiry_idx ON idempotency_keys(expires_at);

CREATE TABLE artifacts (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id uuid REFERENCES jobs(id) ON DELETE CASCADE,
    object_key text NOT NULL UNIQUE,
    media_type text NOT NULL,
    size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
    sha256 bytea NOT NULL CHECK (octet_length(sha256) = 32),
    retention_expires_at timestamptz NOT NULL,
    deletion_state text NOT NULL DEFAULT 'retained'
        CHECK (deletion_state IN ('retained', 'queued', 'deleted', 'legal_hold')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_outbox (
    event_id uuid PRIMARY KEY,
    occurred_at timestamptz NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    target_type text NOT NULL,
    target_id text NOT NULL,
    outcome text NOT NULL,
    request_id text,
    trace_id text,
    projected_at timestamptz
);

CREATE INDEX audit_outbox_claim_idx ON audit_outbox(occurred_at)
    WHERE projected_at IS NULL;

CREATE TABLE audit_events (
    event_id uuid NOT NULL,
    occurred_at timestamptz NOT NULL,
    ingested_at timestamptz NOT NULL DEFAULT now(),
    actor_id uuid,
    action text NOT NULL,
    target_type text NOT NULL,
    target_id text NOT NULL,
    outcome text NOT NULL,
    request_id text,
    trace_id text,
    PRIMARY KEY (event_id, occurred_at)
) PARTITION BY RANGE (occurred_at);

CREATE TABLE audit_events_default PARTITION OF audit_events DEFAULT;

CREATE TABLE module_definitions (
    module_id text PRIMARY KEY CHECK (module_id ~ '^[a-z][a-z0-9_-]{1,63}$'),
    descriptor_version text NOT NULL,
    capability text NOT NULL,
    route_slug text NOT NULL UNIQUE,
    navigation_group text NOT NULL
        CHECK (navigation_group IN ('workspace', 'ai_modules', 'administration')),
    title_key text NOT NULL,
    description_key text NOT NULL,
    icon_key text NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    renderer_kind text NOT NULL
        CHECK (renderer_kind IN ('standard_form', 'compiled_custom')),
    input_schema jsonb,
    output_schema jsonb,
    required_roles text[] NOT NULL DEFAULT '{}',
    enabled boolean NOT NULL DEFAULT false,
    created_by uuid REFERENCES users(id),
    approved_by uuid REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE access_events (
    event_id uuid NOT NULL,
    occurred_at timestamptz NOT NULL,
    actor_id uuid,
    method text NOT NULL,
    route_family text NOT NULL,
    status_code smallint NOT NULL,
    latency_ms numeric(12,2) NOT NULL,
    request_id text NOT NULL,
    coarse_client_class text,
    PRIMARY KEY (event_id, occurred_at)
) PARTITION BY RANGE (occurred_at);

CREATE TABLE access_events_default PARTITION OF access_events DEFAULT;

CREATE TABLE inference_interactions (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id uuid,
    module_id text NOT NULL REFERENCES module_definitions(module_id),
    consent_id uuid NOT NULL REFERENCES consents(id),
    purpose text NOT NULL CHECK (purpose IN ('history', 'improvement', 'training_candidate')),
    query_artifact_id uuid REFERENCES artifacts(id) ON DELETE SET NULL,
    answer_artifact_id uuid REFERENCES artifacts(id) ON DELETE SET NULL,
    provider_id text,
    model_id text,
    language text NOT NULL,
    status text NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'deleted')),
    retention_expires_at timestamptz NOT NULL,
    deletion_state text NOT NULL DEFAULT 'retained'
        CHECK (deletion_state IN ('retained', 'queued', 'deleted', 'legal_hold')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX inference_interactions_owner_created_idx
    ON inference_interactions(user_id, created_at DESC);

CREATE TABLE interaction_labels (
    id uuid PRIMARY KEY,
    interaction_id uuid NOT NULL REFERENCES inference_interactions(id) ON DELETE CASCADE,
    annotator_id uuid REFERENCES users(id) ON DELETE SET NULL,
    rating text NOT NULL CHECK (rating IN ('helpful', 'not_helpful')),
    comment text CHECK (length(comment) <= 1000),
    rubric_version text NOT NULL DEFAULT 'result-feedback-v1',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE experience_feedback (
    id uuid PRIMARY KEY,
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    session_id_hash bytea,
    rating smallint CHECK (rating BETWEEN 1 AND 5),
    task_outcome text CHECK (task_outcome IN ('yes', 'partly', 'no')),
    module_ids text[] NOT NULL DEFAULT '{}',
    comment text CHECK (length(comment) <= 2000),
    follow_up_allowed boolean NOT NULL DEFAULT false,
    locale text NOT NULL,
    client_version text,
    retention_expires_at timestamptz NOT NULL,
    submitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE usage_rollups (
    bucket_start timestamptz NOT NULL,
    bucket_size text NOT NULL CHECK (bucket_size IN ('hour', 'day')),
    project_id uuid,
    module_id text NOT NULL REFERENCES module_definitions(module_id),
    provider_id text,
    model_id text,
    outcome text NOT NULL,
    request_count bigint NOT NULL CHECK (request_count >= 0),
    error_count bigint NOT NULL CHECK (error_count >= 0),
    latency_sum_ms numeric(18,2) NOT NULL CHECK (latency_sum_ms >= 0),
    PRIMARY KEY (bucket_start, bucket_size, module_id, provider_id, model_id, outcome)
);
