-- =============================================================================
-- Migration 001: Extensions
-- =============================================================================
-- Idempotent: safe to run multiple times.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- gen_random_uuid() alternative
