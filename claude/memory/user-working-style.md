---
name: user-working-style
description: "The user writes in Singlish (Sinhala in Latin script) mixed with English, reads English replies fine, and approves every push to production explicitly"
metadata:
  node_type: memory
  type: user
  originSessionId: e6832881-c895-45d1-9ff7-6f6555384bbd
  modified: 2026-09-30T12:51:41.503Z
---

The user (developer building this dashboard for a client, Tiljay Computer Forms Production) writes mostly in Sinhala typed in Latin letters mixed with English ("push karanna" = push it, "den" = now, "lassanata" = nicely). English replies have worked fine throughout.

They review each change before it goes live: pushing to `main` deploys to production, so commit locally, report, and push only when they say so (they answer "push karanna" / "ok" / "yes"). They like seeing screenshots and a clear list of what was verified. "Check on dev" means the local copy at http://localhost:8080 (served from the repo, real database). They asked (2026-10-03) for the Claude memory/knowledge to be kept in git too — keep `CLAUDE.md` and `claude/memory/` updated when pushing. They asked for ready-to-paste WhatsApp messages for employees (Sinhala with English button names) and the admin (English). Related: [[deployment-targets]].
