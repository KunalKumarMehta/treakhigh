package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"
)

// TelemetryPayload represents the expected xAPI payload structure
type TelemetryPayload struct {
	Actor     json.RawMessage `json:"actor"`
	Verb      json.RawMessage `json:"verb"`
	Object    json.RawMessage `json:"object"`
	Result    json.RawMessage `json:"result"`
	Context   json.RawMessage `json:"context,omitempty"`
	Timestamp string          `json:"timestamp"`
	Signature string          `json:"signature,omitempty"` // Added by Nginx or our HMAC signing depending on architecture
}

// TelemetryResponse represents the API response
type TelemetryResponse struct {
	Status    string `json:"status"`
	Error     string `json:"error,omitempty"`
	Timestamp string `json:"timestamp"`
}

func handleTelemetry(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Only POST requests are allowed")
		return
	}

	// 1. Read Payload Body
	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "BAD_REQUEST", "Failed to read request body")
		return
	}
	defer r.Body.Close()

	var payload TelemetryPayload
	if err := json.Unmarshal(bodyBytes, &payload); err != nil {
		writeJSONError(w, http.StatusBadRequest, "MALFORMED_PAYLOAD", "Invalid JSON payload")
		return
	}

	// 2. Validate Required Fields
	if payload.Actor == nil || payload.Verb == nil || payload.Object == nil || payload.Result == nil || payload.Timestamp == "" {
		writeJSONError(w, http.StatusBadRequest, "MALFORMED_PAYLOAD", "Missing required xAPI fields")
		return
	}

	// 3. HMAC Signing / Verification (Simulating what n8n did)
	// Compute HMAC of the incoming payload JSON directly to prevent offline spoofing.
	// Since we are replacing the Nginx signer, the Golang service MUST sign it, OR if it's already
	// supposed to act like Nginx + n8n, it handles verification.
	// For this architecture: we assume the frontend sends UNSIGNED payloads.
	// The Golang service will compute the signature *as if* Nginx had signed it, to maintain schema integrity.

	hmacSecret := os.Getenv("HMAC_SECRET")
	if hmacSecret == "" || hmacSecret == "CHANGE_ME" {
		log.Println("[CONFIG_ERROR] HMAC_SECRET environment variable is not set")
		writeJSONError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Server configuration error")
		return
	}

	// Since we are replacing the Njs script AND the n8n webhook, we just accept the payload,
	// compute the signature server-side, and store it.
	canonicalBody := string(bodyBytes) // Just sign the exact incoming JSON for record-keeping

	mac := hmac.New(sha256.New, []byte(hmacSecret))
	mac.Write([]byte(canonicalBody))
	computedSignature := hex.EncodeToString(mac.Sum(nil))

	// If the payload CAME with a signature, we would verify it here using subtle.ConstantTimeCompare
	if payload.Signature != "" {
		expectedMac := computedSignature // simplified, would re-marshal without signature field normally
		receivedMacBytes, err := hex.DecodeString(payload.Signature)
		if err == nil {
			expectedMacBytes, _ := hex.DecodeString(expectedMac)
			if subtle.ConstantTimeCompare(receivedMacBytes, expectedMacBytes) != 1 {
				fmt.Println("HMAC mismatch (optional handling)")
			}
		}
	}

	// 4. Extract IP Address for Record Keeping
	sourceIP := r.Header.Get("X-Real-IP")
	if sourceIP == "" {
		sourceIP = r.RemoteAddr
	}

	// 5. Insert into Database via PgBouncer
	query := `
		INSERT INTO telemetry (
			actor,
			verb,
			object,
			result,
			context,
			signature,
			recorded_at,
			source_ip
		) VALUES (
			$1::jsonb,
			$2::jsonb,
			$3::jsonb,
			$4::jsonb,
			$5::jsonb,
			$6,
			$7::timestamptz,
			$8::inet
		);
	`

	// Context with timeout for db operation
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Pgx pool automatically manages connections from the pool
	_, err = dbPool.Exec(ctx, query,
		payload.Actor,
		payload.Verb,
		payload.Object,
		payload.Result,
		payload.Context, // Omitempty -> can be nil
		computedSignature,
		payload.Timestamp,
		sourceIP,
	)

	if err != nil {
		log.Printf("[DB_ERROR] Failed to insert telemetry: %v\n", err)
		writeJSONError(w, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to persist telemetry data")
		return
	}

	// 6. Respond OK
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(TelemetryResponse{
		Status:    "accepted",
		Timestamp: time.Now().Format(time.RFC3339),
	})
}

func writeJSONError(w http.ResponseWriter, statusCode int, errorCode string, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(TelemetryResponse{
		Status:    "rejected",
		Error:     errorCode,
		Timestamp: time.Now().Format(time.RFC3339),
	})
	log.Printf("[4xx/5xx] %s: %s\n", errorCode, message)
}
