#!/usr/bin/env bash
# Run ON the Evolution server (Hetzner, ssh root@91.98.44.94).
# Makes the WhatsApp gateway keep each number's chat list and contacts, so the
# CRM can read per-chat unread counts and contact names — the data WhatsApp Web
# shows. Messages themselves are still NOT stored there (the CRM keeps those).
set -euo pipefail
cd /opt/evolution
cp .env ".env.bak-$(date +%s)"
sed -i 's/^DATABASE_SAVE_DATA_CHATS=.*/DATABASE_SAVE_DATA_CHATS=true/' .env
sed -i 's/^DATABASE_SAVE_DATA_CONTACTS=.*/DATABASE_SAVE_DATA_CONTACTS=true/' .env
grep -E '^DATABASE_SAVE_DATA_(CHATS|CONTACTS)=' .env
# Restart only the gateway container (the GIF patch mount in docker-compose.yml is kept).
docker compose up -d evolution
docker compose ps
