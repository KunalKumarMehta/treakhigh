// =============================================================================
// TreakHigh — Telemetry Web Worker (IndexedDB Outbox Pattern)
// =============================================================================
// ARCHITECTURE CHANGE: Replaced in-memory retry logic with a durable IndexedDB
// Outbox Pattern. Payloads are saved to IndexedDB immediately, then synced to
// the server via a periodic loop. Records are only deleted after a 200 OK.
//
// This ensures telemetry survives:
//   - Page refreshes (F5)
//   - Browser crashes
//   - Extended offline periods
//   - Tab/window closure
//
// SECURITY ARCHITECTURE:
//   This worker contains NO secrets. The HMAC_SECRET has been moved to the
//   Nginx njs module (server-side). Payloads are sent unsigned to
//   /api/telemetry, where Nginx signs them before proxying to n8n.
//
// USAGE (from main thread):
//   const worker = new Worker('/src/telemetry/worker.js', { type: 'module' });
//   worker.postMessage({ ... });
// =============================================================================

import { buildPayload } from "./payload-builder.js";
import { validatePayload } from "./validator.js";

// ── Configuration ───────────────────────────────────────────────────────────
const TELEMETRY_ENDPOINT = "/api/telemetry";
const SYNC_INTERVAL_MS = 15_000; // Sync loop runs every 15 seconds
const DB_NAME = "treakhigh_telemetry";
const DB_VERSION = 1;
const STORE_NAME = "telemetry_outbox";

// =============================================================================
// IndexedDB Wrapper — Zero-dependency vanilla JS helper
// =============================================================================
// Provides a minimal async API over the IndexedDB callback-based interface.
// No external libraries (e.g., idb-keyval) are used.
// =============================================================================

/**
 * Open (or create) the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // Called when the database is created or version changes
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // Auto-incrementing key for each outbox entry
        db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Save a payload to the IndexedDB outbox store.
 * @param {Object} record — { payload, bundleId, createdAt }
 * @returns {Promise<number>} The auto-generated key
 */
async function saveToOutbox(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.add(record);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Read all records from the outbox store.
 * @returns {Promise<Array>} All outbox records
 */
async function readAllFromOutbox() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Delete a single record from the outbox by its key.
 * Only called after a successful 200 OK from the server.
 * @param {number} id — The auto-generated key of the record
 * @returns {Promise<void>}
 */
async function deleteFromOutbox(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

// =============================================================================
// Sync Loop — Drains the outbox by POSTing records to the server
// =============================================================================

/** Flag to prevent overlapping sync cycles */
let isSyncing = false;

/**
 * Attempt to send all queued outbox records to the server.
 * - Records that receive 200 OK are deleted from IndexedDB.
 * - Records that receive 4xx (client errors) are deleted (won't succeed on retry).
 * - Records that receive 5xx or network errors stay in the outbox for retry.
 */
async function syncOutbox() {
  // Guard against overlapping sync cycles
  if (isSyncing) return;
  isSyncing = true;

  try {
    const records = await readAllFromOutbox();
    if (records.length === 0) return;

    for (const record of records) {
      try {
        const response = await fetch(TELEMETRY_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(record.payload),
        });

        if (response.ok) {
          // ✅ Success — remove from outbox and notify main thread
          await deleteFromOutbox(record.id);
          self.postMessage({
            status: "success",
            httpStatus: response.status,
            bundleId: record.bundleId,
            timestamp: record.payload.timestamp,
          });
        } else if (response.status === 429) {
          // ⚠️ Rate limited (429) — transient failure, leave in outbox for retry
          console.warn(
            `[TreakHigh Worker] Rate limited syncing record ${record.id}`,
          );
          self.postMessage({
            status: "warning",
            httpStatus: response.status,
            bundleId: record.bundleId,
            message: "Rate limited, retrying later.",
          });
        } else if (response.status >= 400 && response.status < 500) {
          // ❌ Client error (4xx except 429) — permanent failure, remove from outbox
          await deleteFromOutbox(record.id);
          self.postMessage({
            status: "error",
            httpStatus: response.status,
            bundleId: record.bundleId,
            message: `Permanent failure: ${response.status}`,
          });
        }
        // 5xx errors: leave in outbox for next sync cycle
      } catch (networkError) {
        // Network error (offline, DNS failure, etc.) — leave in outbox
        // The sync loop or online listener will retry later
        console.warn(
          `[TreakHigh Worker] Network error syncing record ${record.id}:`,
          networkError.message,
        );
        // Stop processing remaining records if we're offline
        if (!self.navigator.onLine) break;
      }
    }
  } catch (err) {
    console.error("[TreakHigh Worker] Sync loop error:", err);
  } finally {
    isSyncing = false;
  }
}

// ── Start the periodic sync loop ────────────────────────────────────────────
// Runs every SYNC_INTERVAL_MS to drain any queued outbox records.
setInterval(syncOutbox, SYNC_INTERVAL_MS);

// ── Online listener — trigger immediate sync when connectivity is restored ──
self.addEventListener("online", () => {
  console.log("[TreakHigh Worker] Back online — triggering outbox sync.");
  syncOutbox();
});

// ── Message Handler ─────────────────────────────────────────────────────────
// Receives quiz telemetry data from the main thread, builds the payload,
// validates it, and saves it to IndexedDB. The sync loop handles delivery.

self.onmessage = async (event) => {
  const data = event.data;

  try {
    // 1. Build the xAPI payload (no signature — server handles that)
    const payload = buildPayload(data);

    // 2. Validate before persisting
    const validation = validatePayload(payload);
    if (!validation.valid) {
      self.postMessage({
        status: "validation_error",
        errors: validation.errors,
        bundleId: data.bundleId,
      });
      return;
    }

    // 3. Save to IndexedDB outbox — payload is now durable
    await saveToOutbox({
      payload,
      bundleId: data.bundleId,
      createdAt: Date.now(),
    });

    self.postMessage({
      status: "queued",
      bundleId: data.bundleId,
      message: "Payload saved to outbox. Sync will deliver it.",
    });

    // 4. Attempt immediate sync if online
    if (self.navigator.onLine) {
      syncOutbox();
    }
  } catch (err) {
    // IndexedDB or build error
    self.postMessage({
      status: "error",
      message: err.message,
      bundleId: data.bundleId,
    });
  }
};
