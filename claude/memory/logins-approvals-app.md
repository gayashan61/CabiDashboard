---
name: logins-approvals-app
description: "Logins/roles, employee task lists, submissions with admin approval, notifications and the Android app — built 2026-10-03 (commit 2339e5c), LIVE since 2026-10-03, incl. phone push (Firebase tiljay-cf-pro, push fn + webhook) and the final APK"
metadata:
  node_type: memory
  type: project
  originSessionId: e6832881-c895-45d1-9ff7-6f6555384bbd
  modified: 2026-10-03T11:42:49.871Z
---

Built 2026-10-03 at the user's request (commit 2339e5c, local): admin / TV account (`viewers`) / employee roles (employees.user_id + username, login = `<username>@tiljay.local`); standing task lists (`assignments`); `submissions` (pending ➜ approved/edited/rejected, approved go into `entries`, locked for the employee); `notifications` inbox + `devices` for FCM; RPCs whoami, me, submit_count, review_submission, admin_data, save_assignments, inbox, my_notifications…; Edge Functions `admin-users` (service role, creates logins) and `push` (FCM v1, called by a DB webhook with header x-webhook-secret). Pages: index.html = sign-in + router, me.html = employee page, admin approvals + Employees logins/tasks + TV logins. Android app in `mobile/` (Capacitor 8, appId lk.tiljay.cfpro, opens the live URL; `node build-apk.mjs [--test]`).

User's choices: Android APK from this site with Firebase push; standing task lists; TVs require a login; admin gets console + phone push.

**Why:** employees enter their own counts from their phones; the admin approves.

**How to apply:** all live as of 2026-10-03: employees have logins (simple first-name pattern, created by the admin with the bulk button); push works end to end (Supabase secrets FIREBASE_SERVICE_ACCOUNT + PUSH_WEBHOOK_SECRET, `push` fn Verify JWT off, Database Webhook on notifications INSERT with header x-webhook-secret — secret value kept in the session scratchpad only). Firebase key files are in docs/ (git-ignored); google-services.json copied to mobile/android/app/. Final APK = mobile/dist/TiljayCFPro.apk, debug-signed with ~/.android/debug.keystore — later app updates must use the same keystore or phones must reinstall. Notifications only reach someone who has a login when they are created (give logins before tasks). Webhooks live under Integrations in the new Supabase dashboard. Later on 2026-10-03 (all pushed): notification cards colour-coded via `KPI.noteHTML` (green approved, amber changed, red rejected, blue new task, violet to approve) and tappable; Employees tab fits the screen (buttons on top, inner scroll, fixed titles) with a bulk "Create logins for everyone without one" button. Risk told to the user: the employee password pattern is simple and visible in the public code — a self-service "change password" was offered, not built. Related: [[deployment-targets]], [[go-live-and-backups]], [[testing-approach]].
