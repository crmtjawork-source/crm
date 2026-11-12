#!/usr/bin/env python3
"""
Patches Evolution's dist/main.js so the chat webhooks carry the phone's pin,
archive and mute state (Evolution strips them: chats.update is sent with only
remoteJid). Idempotent. Run ON the Evolution server:

    python3 evolution-patch-chat-flags.py /opt/evolution/patches/main.js

Then restart:  cd /opt/evolution && docker compose up -d evolution
Re-run after any Evolution image upgrade (same as the GIF patch).

Added to the payloads (chats.set / chats.upsert / chats.update):
  pinned        number|null  — pin timestamp (ms) or null
  archived      boolean
  muteEndTime   number|null  — unix seconds the mute ends (-1 or far future = forever)
"""
import shutil, sys, time

path = sys.argv[1]
src = open(path, encoding="utf-8").read()
MARK = "/*chatflags*/"
if MARK in src:
    print("already patched")
    sys.exit(0)

FLAGS = lambda v: f'pinned:{v}.pinned===void 0?void 0:(Number({v}.pinned)||null),archived:{v}.archived===void 0?void 0:!!{v}.archived,muteEndTime:{v}.muteEndTime===void 0?void 0:(Number({v}.muteEndTime)||null)'

edits = [
    # history sync: every chat of the phone, not only the new ones
    (
        'this.sendDataWebhook("chats.set",u)',
        MARK + 'this.sendDataWebhook("chats.set",t.map(g=>({remoteJid:g.id,name:g.name,' + FLAGS("g") + '})))',
    ),
    # new chats announced by WhatsApp
    (
        'this.sendDataWebhook("chats.upsert",i),i.length>0',
        'this.sendDataWebhook("chats.upsert",e.map(g=>({remoteJid:g.id,name:g.name,unreadMessages:g.unreadCount,' + FLAGS("g") + '}))),i.length>0',
    ),
    # a chat changed on the phone (pin / archive / mute / unread)
    (
        'let t=e.map(o=>({remoteJid:o.id,instanceId:this.instanceId}));this.sendDataWebhook("chats.update",t)',
        'let t=e.map(o=>({remoteJid:o.id,instanceId:this.instanceId,unreadMessages:o.unreadCount,' + FLAGS("o") + '}));this.sendDataWebhook("chats.update",t)',
    ),
]
for old, new in edits:
    if src.count(old) != 1:
        sys.exit(f"anchor not found exactly once: {old[:60]}")
    src = src.replace(old, new)

shutil.copy(path, f"{path}.bak-{int(time.time())}")
open(path, "w", encoding="utf-8").write(src)
print("patched")
