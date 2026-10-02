#!/usr/bin/env bash
# Nightly backup of the database and every uploaded file into one dated archive.
# Keeps the last 30 days. Run from cron as root (see DEPLOY.md, step 9).
set -euo pipefail

DATA_DIR="${DATA_DIR:-/var/lib/dreamhive}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/dreamhive}"
KEEP_DAYS="${KEEP_DAYS:-30}"

mkdir -p "$BACKUP_DIR"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# sqlite3's .backup takes a consistent copy even while the app is writing.
sqlite3 "$DATA_DIR/dreamhive.db" ".backup '$work/dreamhive.db'"

archive="$BACKUP_DIR/dreamhive-$(date +%F-%H%M).tar.gz"
tar -czf "$archive" -C "$work" dreamhive.db -C "$DATA_DIR" storage
chmod 600 "$archive"

find "$BACKUP_DIR" -name 'dreamhive-*.tar.gz' -mtime +"$KEEP_DAYS" -delete
echo "Backup written: $archive"
