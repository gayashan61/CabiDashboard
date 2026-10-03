---
name: go-live-and-backups
description: "Went live 2026-09-30 as Tiljay CF Pro; free-plan infra has no DB backups — Supabase Pro + nightly off-site backup recommended, user hasn't decided"
metadata:
  node_type: memory
  type: project
  originSessionId: e6832881-c895-45d1-9ff7-6f6555384bbd
  modified: 2026-09-30T12:51:38.104Z
---

Went live with real data on 2026-09-30, rebranded **Tiljay CF Pro** for **Tiljay Computer Forms Production** (spelled "Tiljay", not "TilJay"; names in `APP_NAME` / `COMPANY_NAME` in `assets/config.js`; logo `assets/logo.png` on a white tile, accent colours from the logo's blue `#00A8EC` and pink `#E6007E`). The user's logo was only 225×225 JPG; they were asked for a larger PNG/SVG.

On 2026-09-30 the user asked how long the infra lasts and what backups exist. Answer given: size is no issue (~3–5 MB of counts a year vs the 500 MB free limit); bandwidth (5 GB/month uncached, org-wide) is fine for 3–5 always-on TVs (~300–400 MB/month each, mostly re-downloaded photos — could be optimised). Risks: Supabase Free has NO backups (none downloadable), pauses after ~7 days of low activity (resume within 90 days), no support; Vercel Hobby forbids commercial use (Torbit plan unknown).

**Why:** a factory now depends on this data daily, and nothing can restore it today.

**How to apply:** recommended Supabase Pro ($25/month, 7 daily backups, no pausing) plus a free nightly backup via a GitHub Actions job in a NEW PRIVATE repo (the main repo is public) with the DB password as a secret — offered to build it; waiting for the user. Related: [[deployment-targets]], [[count-per-department-model]].
