// =============================================================================
// TreakHigh — Telemetry Helpers
// =============================================================================
// Pure utility functions extracted for testability and reuse.
// No side effects, no dependencies on browser APIs (except navigator).
// =============================================================================

/**
 * Detect the device type from the User-Agent string.
 * Works in both main thread and Web Worker contexts.
 *
 * @returns {'mobile' | 'tablet' | 'desktop'}
 */
export function detectDeviceType() {
  const ua = self.navigator?.userAgent ?? "";
  if (/Tablet|iPad/i.test(ua)) return "tablet";
  if (/Mobile|Android|iPhone|iPod/i.test(ua)) return "mobile";
  return "desktop";
}

/**
 * Convert seconds to an ISO 8601 duration string (PTxHxMxS).
 *
 * @param {number} totalSeconds — duration in seconds (non-negative integer)
 * @returns {string} ISO 8601 duration, e.g. "PT2M15S", "PT0S", "PT1H30M"
 * @throws {Error} if totalSeconds is negative or not a finite number
 */
export function toISO8601Duration(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    throw new Error(
      `Invalid duration: ${totalSeconds}. Must be a non-negative number.`,
    );
  }

  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  let dur = "PT";
  if (h > 0) dur += `${h}H`;
  if (m > 0) dur += `${m}M`;
  if (sec > 0 || dur === "PT") dur += `${sec}S`;
  return dur;
}

/**
 * Generate a UUID v4 string.
 * Uses crypto.randomUUID() when available, falls back to manual generation.
 *
 * @returns {string} UUID v4 string
 */
export function generateUUID() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
