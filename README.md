# TreakHigh — Quiz Platform Telemetry Pipeline

> Status: Prototype. This is an early-stage startup experiment retained for its
> product and systems history; it is not presented as a complete product.

A prototype telemetry ingestion pipeline for quiz platforms, built with **Vanilla JS + Web Workers**, **Nginx**, **n8n**, and **PostgreSQL**.

## Architecture

```
┌──────────┐    ┌───────────────┐    ┌─────────────────┐    ┌────────────┐
│  Browser │───▶│  Nginx Proxy  │───▶│  n8n (Webhook)  │───▶│  Postgres  │
│  Worker  │    │  (HMAC Sign)  │    │  (Verify+Store) │    │  (JSONB)   │
└──────────┘    └───────────────┘    └─────────────────┘    └────────────┘
  Unsigned         Server-side          Signature             xAPI
  payload          signing              verification          storage
```

**Data Flow:**

1. Quiz frontend sends interaction data to the **Web Worker** (off main thread)
2. Worker builds an xAPI payload and POSTs it (unsigned) to `/api/telemetry`
3. **Nginx** reverse proxy intercepts, signs with HMAC-SHA256 via njs module
4. Signed payload forwarded to **n8n** webhook for verification + validation
5. Verified data inserted into **PostgreSQL** via **PgBouncer** connection pool

## Security Posture

| Layer                 | Measure                                                                   |
| --------------------- | ------------------------------------------------------------------------- |
| **Secret Management** | All secrets in `.env` (never committed), `.env.example` template provided |
| **HMAC Signing**      | Server-side only (Nginx njs) — no secrets in client JS                    |
| **Network Isolation** | Dual Docker networks: `frontend_net` (public) + `backend_net` (internal)  |
| **Database Access**   | PgBouncer unexposed; Postgres on internal network only                    |
| **Rate Limiting**     | Nginx `limit_req_zone` at 10 req/s per IP                                 |
| **Security Headers**  | CSP, X-Frame-Options, X-Content-Type-Options, XSS-Protection              |
| **Auth**              | Postgres password auth; n8n basic auth; Redis `--requirepass`             |

## Prerequisites

- Docker & Docker Compose v2+
- `openssl` (for secret generation)

## Quick Start (Development)

```bash
# 1. Clone and configure
cp .env.example .env
# Edit .env — replace ALL 'CHANGE_ME' values

# Generate secrets:
openssl rand -base64 32    # for POSTGRES_PASSWORD, N8N_BASIC_AUTH_PASSWORD, REDIS_PASSWORD
openssl rand -hex 32       # for HMAC_SECRET
openssl rand -hex 24       # for N8N_ENCRYPTION_KEY

# 2. Update PgBouncer userlist.txt with SCRAM secret:
# Start postgres to generate the secret
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
# Retrieve the secret
docker exec treakhigh-db psql -U postgres_admin -d quiz_platform -t -c "SELECT rolpassword FROM pg_authid WHERE rolname = 'postgres_admin';"
# Paste result into postgres/pgbouncer/userlist.txt

# 3. Start all services
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# 4. Verify health
docker compose ps
# All services should show "healthy" or "running"

# 5. Access
#   Frontend:  http://localhost
#   n8n UI:    http://localhost:5678  (dev only)
#   PgBouncer: localhost:5432         (dev only)
```

## Deployment Environments

| Environment    | Command                                                                    | Exposed Ports  | Notes                                         |
| -------------- | -------------------------------------------------------------------------- | -------------- | --------------------------------------------- |
| **Dev**        | `docker compose -f docker-compose.yml -f docker-compose.dev.yml up`        | 80, 5432, 5678 | Debug ports, verbose logging                  |
| **Staging**    | `docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d` | 80, 5678       | Moderate resource limits                      |
| **Production** | `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`    | 80 only        | Resource limits, read-only FS, no debug ports |

> **Production n8n access:** Use SSH tunnel: `ssh -L 5678:localhost:5678 user@server`

## Database Migrations

Migrations are in `postgres/migrations/` and run automatically on first container start via `docker-entrypoint-initdb.d`:

| File                      | Purpose                        |
| ------------------------- | ------------------------------ |
| `001_extensions.sql`      | `uuid-ossp` + `pgcrypto`       |
| `002_telemetry_table.sql` | Core `telemetry` table DDL     |
| `003_indexes.sql`         | Optimized GIN + B-tree indexes |

All migrations are idempotent (`CREATE IF NOT EXISTS`).

## n8n Workflow Setup

1. Open n8n UI
2. **Import** `n8n/workflows/quiz-telemetry.json`
3. **Configure Credentials**: Create a PostgreSQL credential pointing to `pgbouncer:5432`
4. **Activate** the workflow

Workflow nodes: `Webhook → Verify & Validate → Is Valid? → Insert Telemetry / Log Error → Respond`

## Project Structure

```
treakhigh/
├── .env.example                    # Secret template (never commit .env)
├── docker-compose.yml              # Base services
├── docker-compose.{dev,staging,prod}.yml  # Env overrides
├── frontend/
│   ├── public/index.html           # Landing page
│   └── src/
│       ├── app.js                  # Main thread (TelemetryClient)
│       └── telemetry/
│           ├── worker.js           # Web Worker (no secrets!)
│           ├── payload-builder.js  # xAPI payload construction
│           ├── validator.js        # Client-side validation
│           └── helpers.js          # Device detection, duration
├── nginx/
│   ├── nginx.conf                  # Main config
│   ├── conf.d/default.conf         # Server block + proxy
│   └── njs/hmac-signer.js          # Server-side HMAC signing
├── n8n/workflows/
│   └── quiz-telemetry.json         # Ingestion workflow
├── postgres/
│   ├── postgresql.conf             # Tuned for 8GB/4vCPU
│   ├── migrations/                 # Versioned SQL
│   └── pgbouncer/                  # Pool config + userlist
├── schema/
│   └── xapi-telemetry.schema.json  # Single Source of Truth
└── README.md
```

## Testing

Send a test payload:

```bash
curl -X POST http://localhost:5678/webhook-test/quiz-telemetry \
  -H "Content-Type: application/json" \
  -d '{
    "actor": {"objectType":"Agent","name":"STU-001","mbox":"mailto:stu001@school.edu"},
    "verb": {"id":"http://adlnet.gov/expapi/verbs/completed","display":{"en-US":"completed"}},
    "object": {"id":"https://treakhigh.app/bundle/math-101-q5","objectType":"Activity","definition":{"name":{"en-US":"Math 101 — Bundle 5"},"type":"http://adlnet.gov/expapi/activities/assessment"}},
    "result": {"score":{"raw":4,"min":0,"max":5,"scaled":0.8},"duration":"PT2M15S","extensions":{"http://example.com/xapi/hints_used":1,"http://example.com/xapi/answer_changes":2,"http://example.com/xapi/device_type":"desktop"}},
    "context": {"registration":"a0b1c2d3-e4f5-6789-abcd-ef0123456789","contextActivities":{"parent":[{"id":"https://treakhigh.app/course/math-101"}]}},
    "timestamp": "2026-02-15T09:00:00Z"
  }'
```

> **Note:** The signature is injected server-side by Nginx — you don't need to compute it manually.

Verify in the database:

```sql
SELECT id, actor->>'name' AS student, recorded_at
FROM telemetry ORDER BY ingested_at DESC LIMIT 5;
```
