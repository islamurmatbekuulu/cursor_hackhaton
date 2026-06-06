# Build stage
FROM golang:1.25-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download
RUN go install github.com/pressly/goose/v3/cmd/goose@latest

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o /bin/masterfabric ./cmd/server

# Runtime stage
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

COPY --from=builder /bin/masterfabric /app/masterfabric
COPY --from=builder /go/bin/goose /app/goose
COPY --from=builder /app/internal/infrastructure/postgres/migrations /app/migrations

EXPOSE 8080

CMD ["/app/masterfabric"]
