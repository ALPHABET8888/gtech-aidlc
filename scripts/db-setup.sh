#!/bin/sh
set -e

# =============================================================================
# db-setup.sh — One-command PostgreSQL database bootstrap via Docker
# =============================================================================

# --- Output Helpers -----------------------------------------------------------
# Consistent messaging with emoji prefixes. Uses printf for POSIX portability.

info() {
  printf '🔍 %s\n' "$1"
}

success() {
  printf '✅ %s\n' "$1"
}

warn() {
  printf '⏳ %s\n' "$1"
}

seed_msg() {
  printf '🌱 %s\n' "$1"
}

summary() {
  printf '📋 %s\n' "$1"
}

die() {
  printf '❌ %s\n' "$1" >&2
  exit 1
}

# --- Prerequisite Checks ------------------------------------------------------

check_docker() {
  info "Checking Docker CLI..."
  if ! command -v docker >/dev/null 2>&1; then
    die "Docker check failed: Docker CLI not found on PATH.
   Install Docker: https://docs.docker.com/get-docker/"
  fi

  info "Checking Docker daemon..."
  if ! docker info >/dev/null 2>&1; then
    die "Docker check failed: Docker daemon is not responsive.
   Start Docker Desktop or the Docker service and try again."
  fi

  success "Docker is installed and running."
}

# Detect Docker Compose command (V2 preferred, V1 fallback)
COMPOSE_CMD=""

check_compose() {
  info "Checking for Docker Compose..."
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
    success "Docker Compose V2 detected."
  elif docker-compose --version >/dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
    success "Docker Compose V1 detected (legacy)."
  else
    die "Docker Compose is not installed. Install Docker Desktop (includes Compose V2): https://docs.docker.com/desktop/"
  fi
}

# --- Environment Configuration ------------------------------------------------

ensure_env() {
  info "Checking .env configuration..."
  if [ -f .env ]; then
    info ".env file already exists — preserving current configuration."
    return 0
  fi

  if [ -f .env.example ]; then
    cp .env.example .env
    success "Created .env from .env.example — using default values."
    return 0
  fi

  die "Environment setup failed: .env.example template is missing.
   Check your git status or re-clone the repository."
}

# --- Container Lifecycle ------------------------------------------------------

start_container() {
  info "Starting database container..."
  if $COMPOSE_CMD up -d; then
    success "Database container started."
  else
    die "Failed to start database container.
   Run: $COMPOSE_CMD logs"
  fi
}

# --- Health Check Polling -----------------------------------------------------

wait_for_healthy() {
  info "Waiting for container to become healthy..."

  # Check if already healthy before entering the loop
  status=$(docker inspect --format='{{.State.Health.Status}}' autoflow-postgres 2>/dev/null)
  if [ "$status" = "healthy" ]; then
    info "Container 'autoflow-postgres' is already healthy."
    success "Database container is ready."
    return 0
  fi

  elapsed=0
  while [ "$elapsed" -lt 60 ]; do
    status=$(docker inspect --format='{{.State.Health.Status}}' autoflow-postgres 2>/dev/null)
    if [ "$status" = "healthy" ]; then
      success "Database container is ready."
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done

  die "Health check failed: Container 'autoflow-postgres' did not become healthy within 60 seconds.
   Run: docker logs autoflow-postgres
   Run: docker inspect --format='{{.State.Health.Status}}' autoflow-postgres"
}

# --- Schema Initialization ----------------------------------------------------

run_schemas() {
  info "Running schema initialization..."

  DB_USER="${POSTGRES_USER:-autoflow}"
  DB_NAME="${POSTGRES_DB:-autoflow}"

  if docker exec -i autoflow-postgres psql -U "$DB_USER" -d "$DB_NAME" < scripts/init-schemas.sql; then
    success "Database schemas initialized."
  else
    die "Schema initialization failed: Could not execute scripts/init-schemas.sql.
   Run: docker logs autoflow-postgres"
  fi
}

# --- Prisma Migrations --------------------------------------------------------

run_migrations() {
  info "Running Prisma migrations..."

  MIGRATION_LOG=$(mktemp)

  if npx prisma migrate deploy >"$MIGRATION_LOG" 2>&1; then
    migration_output=$(cat "$MIGRATION_LOG")
    rm -f "$MIGRATION_LOG"

    if printf '%s' "$migration_output" | grep -q "No pending migrations"; then
      info "Database schema is already in sync — no pending migrations."
    else
      success "Prisma migrations applied successfully."
    fi
  else
    migration_output=$(cat "$MIGRATION_LOG")
    rm -f "$MIGRATION_LOG"
    die "Migration failed:
$migration_output"
  fi
}

# --- Seed Data Population -----------------------------------------------------

run_seed() {
  seed_msg "Running database seed..."

  SEED_LOG=$(mktemp)

  if npx tsx prisma/seed.ts >"$SEED_LOG" 2>&1; then
    rm -f "$SEED_LOG"
    success "Database seeded successfully."
  else
    seed_output=$(cat "$SEED_LOG")
    rm -f "$SEED_LOG"
    die "Seed failed:
$seed_output"
  fi
}

# --- Summary ------------------------------------------------------------------

print_summary() {
  printf '\n'
  summary "=========================================="
  summary "  Database setup complete!"
  summary "=========================================="
  summary ""
  summary "  Host:     localhost"
  summary "  Port:     6432"
  summary "  Database: autoflow"
  summary ""
  summary "  Start the API server:"
  summary "    npx nx serve api"
  summary ""
  summary "=========================================="
  printf '\n'
}

# --- Main Execution -----------------------------------------------------------

check_docker
check_compose
ensure_env
start_container
wait_for_healthy
run_schemas
run_migrations
run_seed
print_summary

exit 0
