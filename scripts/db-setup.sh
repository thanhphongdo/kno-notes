#!/usr/bin/env bash
# Idempotently create the local dev + test databases, then run migrations on both.
# Usage: bash scripts/db-setup.sh [--drop]
set -euo pipefail

DEV_DB=kno_notes_dev
TEST_DB=kno_notes_test
DBS=("$DEV_DB" "$TEST_DB")
HOST="${PGHOST:-localhost}"
PORT="${PGPORT:-5432}"
USER_NAME="${PGUSER:-$(whoami)}"

if ! pg_isready -h "$HOST" -p "$PORT" >/dev/null 2>&1; then
  echo "error: no Postgres on $HOST:$PORT. Start it: brew services start postgresql@16" >&2
  exit 1
fi

if [[ "${1:-}" == "--drop" ]]; then
  for db in "${DBS[@]}"; do
    echo "dropping $db"
    dropdb --if-exists "$db"
  done
fi

for db in "${DBS[@]}"; do
  if psql -lqt | cut -d \| -f 1 | grep -qw "$db"; then
    echo "database $db already exists"
  else
    echo "creating $db"
    createdb "$db"
  fi
done

for db in "${DBS[@]}"; do
  echo "migrating $db"
  DATABASE_URL="postgresql://$USER_NAME@$HOST:$PORT/$db" npx tsx scripts/migrate.ts
done

echo "databases ready: ${DBS[*]}"
