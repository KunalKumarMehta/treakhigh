// =============================================================================
// TreakHigh — xAPI Payload Builder
// =============================================================================
// Assembles a full xAPI-compliant telemetry object from raw quiz interaction
// data. Separated from the worker for independent testing.
//
// ARCHITECTURE: This module is a pure function — no network calls, no secrets.
// The payload is sent UNSIGNED to the Nginx proxy, which handles HMAC signing
// server-side before forwarding to n8n.
// =============================================================================

import { detectDeviceType, toISO8601Duration } from "./helpers.js";

/**
 * @typedef {Object} QuizData
 * @property {string}  studentId     — Anonymized student identifier
 * @property {string}  studentEmail  — mailto: URI (xAPI mbox format)
 * @property {string}  bundleId      — URI identifying the question bundle
 * @property {string}  bundleName    — Human-readable bundle name
 * @property {string}  courseId      — URI identifying the parent course
 * @property {string}  sessionId     — UUID v4 for this quiz session
 * @property {number}  rawScore      — Points earned
 * @property {number}  maxScore      — Maximum possible points
 * @property {number}  durationSec   — Time spent in seconds
 * @property {number}  [hintsUsed]   — Number of hints used (default: 0)
 * @property {number}  [answerChanges] — Number of answer changes (default: 0)
 */

/**
 * Build an xAPI-compliant telemetry payload from raw quiz data.
 *
 * The returned object contains NO signature — signing is handled
 * server-side by the Nginx njs module.
 *
 * @param {QuizData} data — Raw quiz interaction data
 * @returns {Object} xAPI payload ready for submission
 * @throws {Error} if required fields are missing
 */
export function buildPayload(data) {
  // ── Input Validation ────────────────────────────────────────────────
  const required = [
    "studentId",
    "studentEmail",
    "bundleId",
    "bundleName",
    "courseId",
    "sessionId",
  ];
  for (const field of required) {
    if (!data[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  if (typeof data.rawScore !== "number" || typeof data.maxScore !== "number") {
    throw new Error("rawScore and maxScore must be numbers");
  }

  if (data.maxScore <= 0) {
    throw new Error("maxScore must be greater than 0");
  }

  // ── Build Payload ───────────────────────────────────────────────────
  const scaled = +(data.rawScore / data.maxScore).toFixed(4);

  return {
    timestamp: new Date().toISOString(),

    actor: {
      objectType: "Agent",
      name: data.studentId,
      mbox: data.studentEmail,
    },

    verb: {
      id: "http://adlnet.gov/expapi/verbs/completed",
      display: { "en-US": "completed" },
    },

    object: {
      id: data.bundleId,
      objectType: "Activity",
      definition: {
        name: { "en-US": data.bundleName },
        type: "http://adlnet.gov/expapi/activities/assessment",
      },
    },

    result: {
      score: {
        raw: data.rawScore,
        min: 0,
        max: data.maxScore,
        scaled,
      },
      duration: toISO8601Duration(data.durationSec ?? 0),
      extensions: {
        "http://example.com/xapi/hints_used": data.hintsUsed ?? 0,
        "http://example.com/xapi/answer_changes": data.answerChanges ?? 0,
        "http://example.com/xapi/device_type": detectDeviceType(),
      },
    },

    context: {
      registration: data.sessionId,
      contextActivities: {
        parent: [{ id: data.courseId }],
      },
    },
  };
}
