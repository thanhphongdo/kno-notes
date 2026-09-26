#!/usr/bin/env bash
# Idempotently create the local dev + test databases, then run migrations.
# Usage: bash scripts/db-setup.sh [--drop]
set -euo pipefail

DBS=(kno_notes_dev kno_notes_test)

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

echo "databases ready: ${DBS[*]}"
