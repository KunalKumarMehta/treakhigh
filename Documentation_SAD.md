# **Software Architecture Document (SAD)**

**Project Name:** TreakHigh

**Architecture Pattern:** Decoupled Hybrid Client-Server with Event-Driven Routing

**Tech Stack:** Vanilla JS, Nginx, n8n, PostgreSQL, Docker

## **1\. Architectural Overview**

The architecture implements a **"Queue-Based Event Driven"** model. It explicitly rejects the traditional synchronous Request/Response cycle for test submission to mitigate network fragility.

### **1.1. High-Level Diagram**

\[Browser / Web Worker\] \--(Unsigned JSON)--\> \[Nginx Proxy\] \--(Signed JSON)--\> \[n8n Webhook\]  
 |  
 v  
\[PostgreSQL\] \<--(Write)-- \[PgBouncer\] \<--(Read/Write)-- \[n8n Worker\] \<--(Job)-- \[Redis\]

## **2\. Component Design**

### **2.1. Frontend (The Autonomous Client)**

- **Technology:** Vanilla ES6 JavaScript, HTML5, CSS3.
- **Responsibility:** Rendering questions, immediate validation (client-side), and telemetry collection.
- **Key Design Pattern:** **Web Worker Offloading**.
  - The main thread handles UI rendering.
  - A dedicated Web Worker (worker.js) handles data serialization, validation against the xAPI schema (validator.js), and exponential backoff retries for network requests.
  - _Rationale:_ Ensures the UI never freezes, even during heavy data processing.

### **2.2. The Edge Gateway (Nginx)**

- **Technology:** Nginx with njs module.
- **Responsibility:** Static file serving, reverse proxying, and **Security Enforcement**.
- **Key Mechanism:** **Server-Side HMAC Signing**.
  - The hmac-signer.js module intercepts incoming telemetry payloads.
  - It injects an X-Signature header or body field using a secret stored ONLY in the Nginx container (HMAC_SECRET).
  - _Rationale:_ Prevents "Inspect Element" cheating. Students never possess the secret key required to forge a valid payload.

### **2.3. The Logic Engine (n8n)**

- **Technology:** n8n (Workflow Automation) in **Queue Mode**.
- **Responsibility:** Ingestion, Verification, and Adaptive Routing.
- **Workflow Logic (quiz-telemetry.json):**
  1. **Trigger:** Webhook receives signed payload.
  2. **Verify:** Function node re-calculates HMAC. If mismatch \-\> Reject (403).
  3. **Process:** Function node executes Rasch model logic (future implementation).
  4. **Persist:** Insert valid xAPI data into PostgreSQL.
- **Concurrency Strategy:** Uses **Redis** (password-protected via `--requirepass`) to buffer incoming webhooks. Worker nodes process the queue asynchronously, preventing bottlenecks during the "class-start surge."

### **2.4. Data Persistence Layer**

- **Technology:** PostgreSQL 15 \+ PgBouncer.
- **Database Design:**
  - **Table:** telemetry uses JSONB columns (actor, verb, object, result) to store xAPI data without rigid schema migrations.
  - **Indexing:** Optimized B-Tree expression indexes (e.g., (actor \-\>\> 'mbox')) for rapid filtering without the write-penalty of full GIN indexes.
- **Connection Pooling:** **PgBouncer** in transaction mode.
  - Multiplexes 1,000+ client connections into \~50 active database connections.
  - _Rationale:_ Prevents PostgreSQL process exhaustion on limited hardware (8GB RAM).

## **3\. Infrastructure & Deployment**

- **Orchestration:** Docker Compose.
- **Network Isolation:**
  - frontend_net: Public-facing. Connects Nginx and n8n-main.
  - backend_net: Internal only. Connects n8n, Redis, PgBouncer, and Postgres.
- **Self-Healing:**
  - autoheal container monitors Docker socket and restarts unhealthy services.
  - watchtower handles automated updates during maintenance windows.

## **4\. Security Architecture**

- **Zero-Trust Client:** The backend assumes all client input is potentially malicious until the HMAC signature is verified.
- **Secret Management:** Secrets (POSTGRES_PASSWORD, HMAC_SECRET, REDIS_PASSWORD) are injected via .env file at runtime and never committed to version control.
- **Least Privilege:** Nginx drops all capabilities except network binding; Postgres listens only on the internal Docker network.
- **CORS:** Origin whitelist enforced by Nginx `map` directive — only approved domains receive `Access-Control-Allow-Origin`.

## **5\. Data Flow (Telemetry Ingestion)**

1. **Capture:** Student finishes bundle. JS gathers metrics (time, hints).
2. **Build:** Worker constructs xAPI JSON.
3. **Transport:** Worker POSTs to /api/telemetry.
4. **Sign:** Nginx signs payload using HMAC_SECRET.
5. **Queue:** n8n-main pushes job to Redis.
6. **Execute:** n8n-worker pulls job, verifies signature, writes to DB.
7. **Ack:** 200 OK returned to client (asynchronous confirmation).
