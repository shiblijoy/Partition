#!/usr/bin/env bash
# Nightly backup of the database and every uploaded file into one dated archive.
# NFR-REL-02: daily backups are kept 30 days, and the first backup of each month 7 years.
# Run from cron as root (see DEPLOY.md, step 9).
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

# The first backup of each month is also kept as a monthly copy.
mkdir -p "$BACKUP_DIR/monthly"
monthly="$BACKUP_DIR/monthly/dreamhive-$(date +%Y-%m).tar.gz"
[ -e "$monthly" ] || cp "$archive" "$monthly"

find "$BACKUP_DIR" -maxdepth 1 -name 'dreamhive-*.tar.gz' -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR/monthly" -name 'dreamhive-*.tar.gz' -mtime +2557 -delete   # 7 years
echo "Backup written: $archive"
