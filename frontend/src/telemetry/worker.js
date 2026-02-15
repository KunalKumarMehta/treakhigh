// =============================================================================
// TreakHigh — Telemetry Web Worker
// =============================================================================
// Runs off the main thread. Receives raw quiz interaction data, builds an
// xAPI-compliant JSON payload, validates it, and POSTs it to the Nginx
// reverse proxy endpoint.
//
// SECURITY ARCHITECTURE:
//   This worker contains NO secrets. The HMAC_SECRET has been moved to the
//   Nginx njs module (server-side). Payloads are sent unsigned to
//   /api/telemetry, where Nginx signs them before proxying to n8n.
//
// USAGE (from main thread):
//   const worker = new Worker('/src/telemetry/worker.js', { type: 'module' });
//   worker.postMessage({
//     studentId:     'STU-042',
//     studentEmail:  'mailto:stu042@school.edu',
//     bundleId:      'https://treakhigh.app/bundle/math-101-q5',
//     bundleName:    'Math 101 — Bundle 5',
//     courseId:      'https://treakhigh.app/course/math-101',
//     sessionId:     'a0b1c2d3-e4f5-6789-abcd-ef0123456789',
//     rawScore:      4,
//     maxScore:      5,
//     durationSec:   135,
//     hintsUsed:     1,
//     answerChanges: 2,
//   });
// =============================================================================

import { buildPayload } from "./payload-builder.js";
import { validatePayload } from "./validator.js";

// ── Configuration ───────────────────────────────────────────────────────────
// ARCHITECTURE: Relative URL — Nginx handles routing.
// No hardcoded host/port; works in any environment.
const TELEMETRY_ENDPOINT = "/api/telemetry";

// Retry configuration for transient failures
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000; // Exponential backoff base

// ── Retry Helper ────────────────────────────────────────────────────────────

/**
 * Sleep for a given number of milliseconds.
 * @param {number} ms — milliseconds to wait
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Post a payload with exponential backoff retry.
 *
 * @param {Object} payload     — JSON payload to send
 * @param {number} maxRetries  — max retry attempts
 * @returns {Promise<Response>} fetch Response
 * @throws {Error} after all retries exhausted
 */
async function postWithRetry(payload, maxRetries = MAX_RETRIES) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(TELEMETRY_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // Don't retry client errors (4xx) — they won't succeed on retry
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }

      // Server error (5xx) — retry with backoff
      lastError = new Error(`Server error: ${response.status}`);
    } catch (err) {
      // Network error — retry with backoff
      lastError = err;
    }

    // Exponential backoff: 1s, 2s, 4s
    if (attempt < maxRetries) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      await sleep(delay);
    }
  }

  throw lastError;
}

// ── Message Handler ─────────────────────────────────────────────────────────

self.onmessage = async (event) => {
  const data = event.data;

  try {
    // 1. Build the xAPI payload (no signature — server handles that)
    const payload = buildPayload(data);

    // 2. Validate before sending
    const validation = validatePayload(payload);
    if (!validation.valid) {
      self.postMessage({
        status: "validation_error",
        errors: validation.errors,
        bundleId: data.bundleId,
      });
      return;
    }

    // 3. Send to Nginx proxy with retry logic
    const response = await postWithRetry(payload);

    // 4. Report result back to the main thread
    self.postMessage({
      status: response.ok ? "success" : "error",
      httpStatus: response.status,
      bundleId: data.bundleId,
      timestamp: payload.timestamp,
    });
  } catch (err) {
    // All retries exhausted or unexpected error
    self.postMessage({
      status: "error",
      message: err.message,
      bundleId: data.bundleId,
      retried: true,
    });
  }
};
