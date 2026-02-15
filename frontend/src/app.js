// =============================================================================
// TreakHigh — Main Thread Application Bootstrap
// =============================================================================
// Manages the telemetry Web Worker lifecycle and provides a clean API
// for the quiz application to send telemetry events.
//
// USAGE:
//   <script type="module" src="/src/app.js"></script>
//   or import { TelemetryClient } from '/src/app.js';
// =============================================================================

/**
 * TelemetryClient wraps the Web Worker and provides a promise-based API
 * for sending quiz telemetry.
 */
class TelemetryClient {
  /** @type {Worker|null} */
  #worker = null;

  /** @type {Map<string, { resolve: Function, reject: Function }>} */
  #pending = new Map();

  /** @type {boolean} */
  #initialized = false;

  /**
   * Initialize the telemetry worker.
   * @returns {TelemetryClient} this instance for chaining
   */
  init() {
    if (this.#initialized) {
      console.warn("[TreakHigh] TelemetryClient already initialized.");
      return this;
    }

    if (!window.Worker) {
      console.error("[TreakHigh] Web Workers not supported in this browser.");
      return this;
    }

    this.#worker = new Worker("/src/telemetry/worker.js", { type: "module" });

    this.#worker.onmessage = (event) => {
      const { bundleId, ...result } = event.data;
      const pending = this.#pending.get(bundleId);

      if (pending) {
        this.#pending.delete(bundleId);
        if (result.status === "success") {
          pending.resolve(result);
        } else {
          pending.reject(result);
        }
      }

      // Log all responses for observability
      const logLevel = result.status === "success" ? "log" : "warn";
      console[logLevel](`[TreakHigh] Telemetry ${result.status}:`, result);
    };

    this.#worker.onerror = (error) => {
      console.error("[TreakHigh] Worker error:", error.message);
    };

    this.#initialized = true;
    console.log("[TreakHigh] Telemetry client initialized.");
    return this;
  }

  /**
   * Send quiz telemetry data. Returns a promise that resolves/rejects
   * when the worker reports the result.
   *
   * @param {Object} quizData — See payload-builder.js QuizData typedef
   * @returns {Promise<Object>} Resolves with { status, httpStatus, timestamp }
   */
  send(quizData) {
    if (!this.#worker) {
      return Promise.reject(
        new Error("TelemetryClient not initialized. Call .init() first."),
      );
    }

    return new Promise((resolve, reject) => {
      this.#pending.set(quizData.bundleId, { resolve, reject });
      this.#worker.postMessage(quizData);

      // Timeout after 30 seconds to prevent memory leaks
      setTimeout(() => {
        if (this.#pending.has(quizData.bundleId)) {
          this.#pending.delete(quizData.bundleId);
          reject(
            new Error(`Telemetry send timed out for ${quizData.bundleId}`),
          );
        }
      }, 30000);
    });
  }

  /**
   * Gracefully terminate the worker.
   */
  destroy() {
    if (this.#worker) {
      this.#worker.terminate();
      this.#worker = null;
      this.#initialized = false;

      // Reject all pending promises
      for (const [, { reject }] of this.#pending) {
        reject(new Error("TelemetryClient destroyed"));
      }
      this.#pending.clear();

      console.log("[TreakHigh] Telemetry client destroyed.");
    }
  }
}

// ── Auto-initialize on page load ────────────────────────────────────────────
const telemetry = new TelemetryClient().init();

// Export for programmatic use
export { TelemetryClient, telemetry };
