// =============================================================================
// TreakHigh — Client-Side Payload Validator
// =============================================================================
// Lightweight JSON Schema validation against the centralized xAPI schema.
// Validates payloads BEFORE sending to reduce unnecessary network traffic
// and surface errors early in the browser console.
//
// ARCHITECTURE: This is a simplified validator (not a full JSON Schema engine).
// It checks required fields, types, and enumerated values from the schema.
// For full JSON Schema compliance, consider importing ajv in a build step.
// =============================================================================

/**
 * Validate a telemetry payload against the xAPI contract.
 *
 * @param {Object} payload — The xAPI payload to validate
 * @returns {{ valid: boolean, errors: string[] }} Validation result
 */
export function validatePayload(payload) {
  const errors = [];

  // ── Top-level required fields ─────────────────────────────────────
  const requiredTopLevel = ["actor", "verb", "object", "result", "timestamp"];
  for (const field of requiredTopLevel) {
    if (!payload[field]) {
      errors.push(`Missing required field: "${field}"`);
    }
  }

  // ── Actor validation ──────────────────────────────────────────────
  if (payload.actor) {
    if (!payload.actor.mbox) errors.push("actor.mbox is required");
    if (!payload.actor.name) errors.push("actor.name is required");
    if (payload.actor.objectType && payload.actor.objectType !== "Agent") {
      errors.push('actor.objectType must be "Agent"');
    }
  }

  // ── Verb validation ───────────────────────────────────────────────
  if (payload.verb) {
    if (payload.verb.id !== "http://adlnet.gov/expapi/verbs/completed") {
      errors.push('verb.id must be "http://adlnet.gov/expapi/verbs/completed"');
    }
  }

  // ── Object validation ─────────────────────────────────────────────
  if (payload.object) {
    if (!payload.object.id) errors.push("object.id is required");
    if (!payload.object.definition)
      errors.push("object.definition is required");
  }

  // ── Result validation ─────────────────────────────────────────────
  if (payload.result) {
    const { score } = payload.result;
    if (!score) {
      errors.push("result.score is required");
    } else {
      if (typeof score.raw !== "number")
        errors.push("result.score.raw must be a number");
      if (typeof score.max !== "number")
        errors.push("result.score.max must be a number");
      if (typeof score.scaled !== "number")
        errors.push("result.score.scaled must be a number");
      if (score.scaled < 0 || score.scaled > 1) {
        errors.push("result.score.scaled must be between 0 and 1");
      }
    }

    if (!payload.result.duration) {
      errors.push("result.duration is required");
    }

    // Validate device type extension
    if (payload.result.extensions) {
      const deviceType =
        payload.result.extensions["http://example.com/xapi/device_type"];
      if (deviceType && !["mobile", "tablet", "desktop"].includes(deviceType)) {
        errors.push('device_type must be "mobile", "tablet", or "desktop"');
      }
    }
  }

  // ── Timestamp validation ──────────────────────────────────────────
  if (payload.timestamp && isNaN(Date.parse(payload.timestamp))) {
    errors.push("timestamp must be a valid ISO 8601 date-time string");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
