package main

import (
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// In-memory simplistic rate limiter by IP
// For production across multiple instances, Redis is preferred, but for an 8GB server
// doing self-hosted, this memory structure is efficient enough for 1000s of students.
type client struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

var (
	mu      sync.Mutex
	clients = make(map[string]*client)
)

func rateLimitMiddleware(next http.HandlerFunc) http.HandlerFunc {
	// Configure limits: 10 req/s with burst of 20
	return func(w http.ResponseWriter, r *http.Request) {
		ip := r.Header.Get("X-Real-IP")
		if ip == "" {
			ip = r.RemoteAddr
		}

		mu.Lock()
		if _, found := clients[ip]; !found {
			clients[ip] = &client{limiter: rate.NewLimiter(rate.Limit(10), 20)}
		}
		clients[ip].lastSeen = time.Now()
		limiter := clients[ip].limiter
		mu.Unlock()

		if !limiter.Allow() {
			writeJSONError(w, http.StatusTooManyRequests, "RATE_LIMITED", "Too many requests. Please slow down.")
			return
		}

		next(w, r)
	}
}

// Background task to cleanup stale IP rate limiters to prevent memory leaks
func cleanupStaleLimiters() {
	for {
		time.Sleep(time.Minute)
		mu.Lock()
		for ip, client := range clients {
			if time.Since(client.lastSeen) > 3*time.Minute {
				delete(clients, ip)
			}
		}
		mu.Unlock()
	}
}

func main() {
	log.Println("🚀 Starting TreakHigh Golang Telemetry Ingester...")

	// Initialization
	if err := initDB(); err != nil {
		log.Fatalf("Failed to initialize database: %v\n", err)
	}
	defer closeDB()

	// Clean limiters in background
	go cleanupStaleLimiters()

	// Routing
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})
	mux.HandleFunc("/api/telemetry", rateLimitMiddleware(handleTelemetry))

	// Server config
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	server := &http.Server{
		Addr:         ":" + port,
		Handler:      mux,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	log.Printf("Listening on http://0.0.0.0:%s\n", port)
	if err := server.ListenAndServe(); err != nil {
		log.Fatalf("HTTP server failed: %v\n", err)
	}
}
