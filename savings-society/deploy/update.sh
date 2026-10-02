#!/usr/bin/env bash
# Installs the latest version from GitHub: backup, pull, install, migrate, build, restart.
# Run as root: sudo /opt/dreamhive/savings-society/deploy/update.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/dreamhive/savings-society}"
BRANCH="${BRANCH:-master}"
as_app() { sudo -u dreamhive -H bash -c "cd '$APP_DIR' && $1"; }

"$APP_DIR/deploy/backup.sh"                         # always back up before changing anything
as_app "git fetch origin '$BRANCH' && git checkout '$BRANCH' && git pull --ff-only origin '$BRANCH'"
as_app "npm ci"
as_app "npx prisma migrate deploy"
as_app "npm run build"
systemctl restart dreamhive
echo "Updated to $(as_app 'git log --oneline -1')"
