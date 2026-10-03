---
name: count-per-department-model
description: "Data model history: % of target → count per department → count per task (DB table `jobs`) like the client Excel sheet; live with real data since 2026-09-30"
metadata:
  node_type: memory
  type: project
  originSessionId: e6832881-c895-45d1-9ff7-6f6555384bbd
  modified: 2026-09-30T12:51:22.189Z
---

On 2026-09-29 the dashboard moved from % of target to one count per person per department, then (same day) to the client's Excel layout (`docs/SYSTEM - Production Performance Calculation 2026.xlsx`: one sheet per day, rows = Dept → machine/unit → task, columns = people). Model: `jobs` table (department, machine, name, unit, soft-delete `active`), entries keyed (date, employee, job); colours = count vs average of everyone on the same task that day; department total = its tasks in the department's unit.

The UI calls them **Tasks** (renamed 2026-09-29, commit 6dc43f9); the DB table, RPC `save_jobs` and code identifiers still say `jobs`.

**Why:** the client's staff record output per task/machine with different units even inside one department.

**How to apply:** prod state as of 2026-09-30: 6 departments (Sheets, Sets, Packing, Rolls, Clean, Stores), 20 employees with photos, the 33 sheet tasks plus 4 leftover "Other" tasks (3 active, 1 hidden) the user was told they can remove; test counts were deleted before go-live and real counts started 2026-09-30. Task units for PR (pcs), Plate 10x24 (plates), Impression (sheets) and Packing's total unit (boxes) were guesses still to confirm with the client. Related: [[deployment-targets]], [[go-live-and-backups]].
