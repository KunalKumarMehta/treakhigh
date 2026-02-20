package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
)

var dbPool *pgxpool.Pool

func initDB() error {
	dbURL := fmt.Sprintf("postgres://%s:%s@%s:%s/%s",
		os.Getenv("POSTGRES_USER"),
		os.Getenv("POSTGRES_PASSWORD"),
		os.Getenv("DB_HOST"), // Should map to "pgbouncer" in docker-compose
		"5432",
		os.Getenv("POSTGRES_DB"),
	)

	// Append Simple Protocol query exec mode for PgBouncer transaction mode compatibility
	config, err := pgxpool.ParseConfig(dbURL + "?default_query_exec_mode=exec")
	if err != nil {
		return fmt.Errorf("unable to parse database config: %w", err)
	}

	// Connection pool settings
	config.MaxConns = 50 // We are multiplexing through pgbouncer anyway

	dbPool, err = pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		return fmt.Errorf("unable to create connection pool: %w", err)
	}

	// Test connection
	if err := dbPool.Ping(context.Background()); err != nil {
		return fmt.Errorf("database ping failed: %w", err)
	}

	log.Println("✅ Successfully connected to PostgreSQL via PgBouncer")
	return nil
}

func closeDB() {
	if dbPool != nil {
		dbPool.Close()
	}
}
