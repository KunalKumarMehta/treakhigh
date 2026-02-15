# n8n Workflow — xAPI Telemetry Ingestion Pipeline

> **Workflow name**: `Quiz Telemetry Ingest`
> **Trigger**: Webhook (POST)
> **Output**: Row inserted into `telemetry` table (success) or error logged (failure)

---

## Workflow Architecture

```
                                        ┌──────────────────┐    ┌─────────────┐
                                   ✓    │  Insert Telemetry │───▶│ Respond OK  │
┌──────────┐    ┌──────────────┐  ┌───▶ │  (Postgres)       │    │ (200)       │
│ Webhook  │───▶│ Verify &     │──┤     └──────────────────┘    └─────────────┘
│ (POST)   │    │ Validate     │  │
└──────────┘    └──────────────┘  │     ┌──────────────────┐    ┌─────────────┐
                                   ✗    │  Log Error        │───▶│ Respond Err │
                                  └───▶ │  (Function)       │    │ (400)       │
                                        └──────────────────┘    └─────────────┘
```

---

## Node Details

### 1. Webhook Node

| Setting | Value |
|---------|-------|
| HTTP Method | `POST` |
| Path | `quiz-telemetry` |
| Response Mode | `Response Node` |
| Authentication | None (HMAC verification in Function node) |

Full URL: `https://<host>/webhook/quiz-telemetry` (proxied via Nginx `/api/telemetry`)

### 2. Verify & Validate (Function Node)

Two-phase validation with granular error codes:

| Phase | Check | Error Code |
|-------|-------|------------|
| HMAC | Missing signature | `MISSING_SIGNATURE` |
| HMAC | Invalid hex format | `INVALID_SIGNATURE` |
| HMAC | Digest mismatch | `INVALID_SIGNATURE` |
| Schema | Missing required fields | `MALFORMED_PAYLOAD` |
| Schema | Invalid actor structure | `MALFORMED_PAYLOAD` |
| Schema | Invalid score type | `MALFORMED_PAYLOAD` |

Uses `crypto.timingSafeEqual()` for constant-time comparison.

### 3. Is Valid? (IF Node)

Routes to success path (`_verified === true`) or error path.

### 4. Insert Telemetry (Postgres Node)

| Parameter | Expression | Maps to |
|-----------|-----------|---------|
| `$1` | `{{ JSON.stringify($json.actor) }}` | `actor JSONB` |
| `$2` | `{{ JSON.stringify($json.verb) }}` | `verb JSONB` |
| `$3` | `{{ JSON.stringify($json.object) }}` | `object JSONB` |
| `$4` | `{{ JSON.stringify($json.result) }}` | `result JSONB` |
| `$5` | `{{ JSON.stringify($json.context) }}` | `context JSONB` |
| `$6` | `{{ $json._signature }}` | `signature TEXT` |
| `$7` | `{{ $json.timestamp }}` | `recorded_at TIMESTAMPTZ` |

**Credentials**: Host `pgbouncer`, Port `5432`, Database `quiz_platform`

### 5. Log Error (Function Node)

Extracts structured error code and original payload for dead-letter analysis. Can be extended to write to a `telemetry_errors` table or send alerts.

### 6. Response Nodes

- **Respond OK**: `200` with `{ status: "accepted" }`
- **Respond Error**: `400` with `{ status: "rejected", error: "<CODE>" }`

---

## Setup

1. Import `n8n/workflows/quiz-telemetry.json` into n8n
2. Create PostgreSQL credential (Host: `pgbouncer`, Port: `5432`)
3. Assign credential to the "Insert Telemetry" node
4. Activate the workflow
