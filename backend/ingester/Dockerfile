# Build Stage
FROM golang:1.21-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY *.go ./
RUN CGO_ENABLED=0 go build -o ingester .

# Final Stage
FROM alpine:3.19

WORKDIR /app
COPY --from=builder /app/ingester .

EXPOSE 8080
CMD ["./ingester"]
