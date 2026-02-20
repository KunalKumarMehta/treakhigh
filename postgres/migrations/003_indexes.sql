-- =============================================================================
-- Migration 003: Indexes
-- =============================================================================
-- ARCHITECTURE DECISION: Targeted indexes instead of blanket GIN on every column.
--
-- REMOVED from original:
--   - GIN on verb   → Always "completed" — zero selectivity, wasted writes.
--   - GIN on object → Rarely queried by containment; expression index on id suffices.
--   - GIN on context → Same rationale; expression index on registration is enough.
--
-- KEPT:
--   - GIN on actor  → Containment queries on nested student attributes.
--   - GIN on result → Score-range containment queries for analytics dashboards.
--
-- ADDED:
--   - B-tree expression indexes on commonly filtered scalar paths.
--     These are 5-10x smaller than full GIN and much cheaper on writes.
--
-- Idempotent: uses CREATE INDEX IF NOT EXISTS.
-- =============================================================================

-- ── GIN Indexes (keep only for columns that need containment queries) ───────

-- Fast student attribute containment: WHERE actor @> '{"mbox":"mailto:…"}'
CREATE INDEX IF NOT EXISTS idx_telemetry_actor_gin
    ON telemetry USING GIN (actor);

-- Fast score-range and extension containment queries for dashboards
CREATE INDEX IF NOT EXISTS idx_telemetry_result_gin
    ON telemetry USING GIN (result);

-- ── B-tree Expression Indexes (cheap, targeted, high-selectivity) ───────────

-- Per-student lookups: WHERE actor->>'mbox' = 'mailto:stu042@school.edu'
CREATE INDEX IF NOT EXISTS idx_telemetry_actor_mbox
    ON telemetry ((actor ->> 'mbox'));

-- Time-range scans: WHERE recorded_at BETWEEN … AND …
CREATE INDEX IF NOT EXISTS idx_telemetry_recorded_at
    ON telemetry (recorded_at DESC);

-- Per-bundle lookups: WHERE object->>'id' = 'https://treakhigh.app/bundle/…'
CREATE INDEX IF NOT EXISTS idx_telemetry_object_id
    ON telemetry ((object ->> 'id'));

-- Per-session lookups: WHERE context->>'registration' = '…uuid…'
CREATE INDEX IF NOT EXISTS idx_telemetry_context_registration
    ON telemetry ((context ->> 'registration'));

-- ── Composite Index (common dashboard query pattern) ────────────────────────
-- Covers: "recent events for a specific student" ordered by time DESC
CREATE INDEX IF NOT EXISTS idx_telemetry_mbox_time
    ON telemetry ((actor ->> 'mbox'), recorded_at DESC);
