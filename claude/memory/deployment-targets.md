---
name: deployment-targets
description: "Where the dashboard is deployed (Supabase project, Vercel project/URL, GitHub repo, git author), how to push as gayashan61, what the auto-mode classifier blocks, and MCP quirks"
metadata:
  node_type: memory
  type: reference
  originSessionId: e6832881-c895-45d1-9ff7-6f6555384bbd
  modified: 2026-09-30T12:51:31.510Z
---

- Supabase project ref `bbhtejcxjytxmnxfsjxx` (https://bbhtejcxjytxmnxfsjxx.supabase.co), Free plan. The Supabase MCP server (project-scoped `.mcp.json`) often needs re-authentication via /mcp.
- Prod DB writes through the Supabase MCP are blocked by the Claude Code auto-mode classifier (apply_migration = "Production Deploy", `delete from entries` = "Cloud Storage Mass Delete"). Read-only `execute_sql` works. So: test SQL locally, give the user the exact SQL to run in the SQL Editor, then verify with a read query.
- GitHub: github.com/gayashan61/CabiDashboard (PUBLIC), branch `main`; repo-local git author `gayashan61`. Pushes must be made as gayashan61.
- The machine's gh CLI has two accounts and the active one is often a different account; push as gayashan61 without switching globally: `GH_TOKEN="$(gh auth token --user gayashan61)" git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push origin main`.
- `.gitignore` keeps out `docs/` (the client's private spreadsheet, Firebase key files, test sample data), `.claude/`, `.agents/`, `skills-lock.json`, mobile build output + `google-services.json`, and test outputs — never commit those to the public repo. Project knowledge for Claude is committed as `CLAUDE.md` plus a sanitised memory snapshot in `claude/memory/` (no passwords/secrets/personal emails — refresh it when memory changes).
- Supabase Edge Functions: `admin-users` (Verify JWT on) and `push` (Verify JWT off; secrets FIREBASE_SERVICE_ACCOUNT, PUSH_WEBHOOK_SECRET); Database Webhook `push` on notifications INSERT (new dashboard: Integrations ➜ Database Webhooks).
- Vercel: team Torbit (`torbit1`, team_bfUB733eSlE6G37gWhmQwoN3), plan unknown. The real project is `kpidashboard` (prj_UyfF35HNgAWK1Jys6qlNe2Ygx3V2), git-linked, auto-deploys `main` in ~10–20 s; public URL https://kpidashboard-one.vercel.app. Confirm a deploy by curling the live page for a marker string.
- Vercel MCP quirk: most calls with `teamId`/`slug` return 404 for this team; calls without scope work (get_team with teamId does work).
- 2026-09-26: an accidental duplicate empty project `cabidashboard` (prj_MNqeYsfROXt0M0zobKJq52zFhmxq) was created; the user never answered whether to delete it.
- Related: [[count-per-department-model]], [[go-live-and-backups]].
