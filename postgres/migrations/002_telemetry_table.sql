-- =============================================================================
-- Migration 002: Telemetry Table
-- =============================================================================
-- Core xAPI telemetry storage. Each row represents one completed quiz bundle.
--
-- ARCHITECTURE DECISION: JSONB columns map 1:1 to xAPI envelope fields.
-- This preserves the full xAPI structure for compliance while allowing
-- efficient querying via expression indexes (see 003_indexes.sql).
--
-- Idempotent: uses CREATE TABLE IF NOT EXISTS.
-- =============================================================================

CREATE TABLE IF NOT EXISTS telemetry (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- xAPI envelope fields (JSONB for flexible schema evolution)
    actor           JSONB        NOT NULL,   -- { "objectType":"Agent", "name":"…", "mbox":"mailto:…" }
    verb            JSONB        NOT NULL,   -- { "id":"…", "display":{ "en-US":"completed" } }
    object          JSONB        NOT NULL,   -- { "id":"…", "objectType":"Activity", "definition":{…} }
    result          JSONB        NOT NULL,   -- { "score":{…}, "duration":"…", "extensions":{…} }
    context         JSONB,                   -- { "registration":"…", "contextActivities":{…} }

    -- Top-level scalars
    signature       TEXT         NOT NULL,   -- HMAC-SHA256 hex digest (verified by n8n)
    recorded_at     TIMESTAMPTZ  NOT NULL,   -- Client-side ISO 8601 timestamp

    -- Bookkeeping
    ingested_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    source_ip       INET                     -- Client IP captured by Nginx/n8n
);

-- ── Table & Column Documentation ────────────────────────────────────────────
COMMENT ON TABLE  telemetry IS 'xAPI-compliant quiz interaction telemetry received via the n8n webhook pipeline.';
COMMENT ON COLUMN telemetry.actor       IS 'xAPI Actor — identifies the student (Agent with mbox).';
COMMENT ON COLUMN telemetry.verb        IS 'xAPI Verb — always "completed" for quiz bundles.';
COMMENT ON COLUMN telemetry.object      IS 'xAPI Object — the Activity (question bundle) being completed.';
COMMENT ON COLUMN telemetry.result      IS 'xAPI Result — score breakdown, duration, custom extensions.';
COMMENT ON COLUMN telemetry.context     IS 'xAPI Context — session UUID and parent activity references.';
COMMENT ON COLUMN telemetry.signature   IS 'HMAC-SHA256 of the payload body, verified server-side in n8n.';
COMMENT ON COLUMN telemetry.recorded_at IS 'Client-side ISO 8601 timestamp of bundle completion.';
COMMENT ON COLUMN telemetry.ingested_at IS 'Server-side timestamp when the row was inserted.';
