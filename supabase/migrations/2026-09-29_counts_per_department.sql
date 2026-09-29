-- ─────────────────────────────────────────────────────────────
--  Upgrade: "% of target per task"  ➜  "count per department"
--
--  ⚠ DELETES ALL EXISTING ENTRIES (the old per-task rows, mostly the Excel import).
--    Employees, photos, their departments and admin logins are kept.
--  Removes the targets table and the employees' task lists (no longer used).
--
--  Run once in Supabase ➜ SQL Editor, THEN run ../schema.sql.
--  Running it again later does nothing (it only acts on the old format).
-- ─────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'entries' and column_name = 'task') then
    drop table public.entries;            -- recreated by schema.sql with a department column
  end if;
end $$;

drop function if exists public.save_targets(jsonb);
drop table if exists public.targets;
alter table public.employees drop column if exists tasks;
