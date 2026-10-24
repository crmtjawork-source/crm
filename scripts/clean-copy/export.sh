#!/usr/bin/env bash
# Builds a clean, shareable copy of this repo in a NEW folder:
#   - only files tracked at HEAD (no .env*, no node_modules, no local exports)
#   - fresh git history with a single commit (no old commit messages)
#   - tenant-specific text (legal pages, production URLs) replaced by generic
#     placeholders
#   - fails if anything that looks like a secret, a production reference or a
#     value from apps/web/.env.local is found in the result
#
#   bash scripts/clean-copy/export.sh <dest-dir>
#
# Never touches this checkout, production, or any remote.
set -euo pipefail

SRC="$(cd "$(dirname "$0")/../.." && pwd)"
DEST="${1:?usage: export.sh <dest-dir>}"
if [ -e "$DEST" ] && [ -n "$(ls -A "$DEST" 2>/dev/null)" ]; then
  echo "refusing: $DEST exists and is not empty" >&2; exit 1
fi
mkdir -p "$DEST"
DEST="$(cd "$DEST" && pwd)"

echo "1) exporting tracked files at HEAD ($(git -C "$SRC" rev-parse --short HEAD))"
git -C "$SRC" archive HEAD | tar -x -C "$DEST"

echo "2) applying generic overrides"
rm -rf "$DEST/scripts/clean-copy"                       # the export tool itself
cp -R "$SRC/scripts/clean-copy/overrides/." "$DEST/"
# Legal page footer: business name + privacy contact.
sed -i '' \
  -e 's/אינווסטד נדל״ן א\.ח\.ר בע&quot;מ/[שם החברה]/' \
  -e 's/info@investedgroup\.co\.il/privacy@example.com/g' \
  "$DEST/apps/web/src/components/LegalPage.tsx"
sed -i '' -e "s#can't fetch the company website (it answers it with HTTP 500)#may not be able to fetch a company website#" \
  "$DEST/apps/web/src/components/LegalPage.tsx"
# Production URL defaults -> safe local defaults (set APP_URL / VAPID_SUBJECT).
sed -i '' \
  -e 's#process.env.APP_URL || "https://crm-crmtja.vercel.app"#process.env.APP_URL || "http://localhost:3000"#' \
  -e 's#process.env.VAPID_SUBJECT || "https://crm-crmtja.vercel.app"#process.env.VAPID_SUBJECT || "mailto:admin@example.com"#' \
  "$DEST/apps/web/src/lib/server/env.ts"

# Example import script: drop the pilot tenant's name from a comment.
sed -i '' -e 's#// Invested stopped using this stage (2026-10-20); its deals sit in follow-up.#// This stage was retired; its deals sit in follow-up.#' \
  "$DEST/scripts/import-fireberry.mjs"

echo "3) scanning for secrets / production / tenant references"
fail=0
PATTERNS='sbp_[A-Za-z0-9]{20,}|vcp_[A-Za-z0-9]{10,}|sb_secret_|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|ghp_|gho_|github_pat_|GOCSPX-|AIza[0-9A-Za-z_-]{30}|BEGIN [A-Z ]*PRIVATE KEY|tpwdunomjelmpgxkmuqx|91[.-]98[.-]44[.-]94|crm-crmtja|crmtja|investedgroup|אינווסטד|[Ii]nvested|claude\.ai/code/artifact|More-Than|Malia'
if grep -rInE --exclude-dir=.git -- "$PATTERNS" "$DEST"; then
  echo "!! pattern hits above" >&2; fail=1
fi
# Every value in the local env file must be absent from the export.
ENVF="$SRC/apps/web/.env.local"
if [ -f "$ENVF" ]; then
  while IFS= read -r line; do
    case "$line" in ''|\#*) continue ;; esac
    name="${line%%=*}"; val="${line#*=}"; val="${val%\"}"; val="${val#\"}"
    [ ${#val} -lt 12 ] && continue
    if grep -rIqF --exclude-dir=.git -- "$val" "$DEST"; then
      echo "!! value of $name from .env.local found in export" >&2; fail=1
    fi
  done < "$ENVF"
fi
if [ "$fail" -ne 0 ]; then echo "export FAILED the scan — nothing committed" >&2; exit 1; fi
echo "   clean"

echo "4) fresh git history"
git -C "$DEST" init -q -b main
git -C "$DEST" add -A
git -C "$DEST" -c user.name="$(git -C "$SRC" config user.name)" -c user.email="$(git -C "$SRC" config user.email)" \
  commit -q -m "Initial import: CRM platform (code + schema, no data)"
echo "done: $DEST ($(git -C "$DEST" ls-files | wc -l | tr -d ' ') files, 1 commit)"
