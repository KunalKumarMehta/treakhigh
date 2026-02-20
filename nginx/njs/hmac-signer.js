// =============================================================================
// TreakHigh — Nginx njs HMAC Signing Module
// =============================================================================
// ARCHITECTURE DECISION:
//   The HMAC_SECRET was previously exposed in the client-side telemetry worker,
//   allowing anyone to forge telemetry payloads. This njs module moves signing
//   server-side: the frontend sends UNSIGNED payloads, and Nginx injects the
//   HMAC-SHA256 signature before proxying to n8n.
//
// HOW IT WORKS:
//   1. Nginx's js_body_filter calls sign() on the request body.
//   2. The module computes HMAC-SHA256 over the raw JSON body.
//   3. It injects a "signature" field into the JSON payload.
//   4. The modified body is forwarded to n8n, which verifies as before.
//
// ENVIRONMENT:
//   Requires HMAC_SECRET set as an environment variable on the Nginx container.
//   Loaded via: js_import hmac from hmac-signer.js;
// =============================================================================

/**
 * njs body filter that injects an HMAC-SHA256 signature into the JSON payload.
 *
 * This function is called by Nginx's js_body_filter directive.
 * It reads the request body, computes the HMAC, and injects the signature
 * field into the outgoing JSON before proxying to n8n.
 *
 * @param {NginxHTTPRequest} r - The Nginx request object
 * @param {NginxHTTPRequestBody} data - The request body chunk
 * @param {boolean} flags.last - Whether this is the last chunk
 */
function sign(r, data, flags) {
  // Accumulate body chunks (payloads are small, ~2KB)
  r.variables.request_body_buffer =
    (r.variables.request_body_buffer || "") + data;

  if (flags.last) {
    var body = r.variables.request_body_buffer;

    try {
      // Read secret from environment variable
      var secret = process.env.HMAC_SECRET;
      if (!secret) {
        r.error("HMAC_SECRET environment variable is not set");
        r.sendBuffer('{"error":"Internal server error"}', { last: true });
        r.done();
        return;
      }

      // Compute HMAC-SHA256 over the raw body
      var crypto = require("crypto");
      var hmacDigest = crypto
        .createHmac("sha256", secret)
        .update(body)
        .digest("hex");

      // Parse the original payload, inject the signature, and re-serialize
      var payload = JSON.parse(body);
      payload.signature = hmacDigest;
      var signedBody = JSON.stringify(payload);

      r.sendBuffer(signedBody, { last: true });
    } catch (e) {
      r.error("HMAC signing failed: " + e.message);
      r.sendBuffer('{"error":"Signing failed"}', { last: true });
    }

    r.done();
  }
}

export default { sign };
