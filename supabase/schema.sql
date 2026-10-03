-- ─────────────────────────────────────────────────────────────
--  Production KPI Dashboard — Supabase database
--  Run this whole file in Supabase ➜ SQL Editor ➜ New query ➜ Run.
--  It is safe to run again after updates (it only adds / replaces, never deletes data).
--  Since the logins / approvals update, nothing can be read without signing in (see README ➜ Logins).
--  Upgrading an older version? First run, in order, the files in migrations/ it hasn't had:
--    2026-09-29_counts_per_department.sql  (from the "targets / tasks" version)
--    2026-09-29_jobs.sql                   (from "one count per department")
-- ─────────────────────────────────────────────────────────────

-- ───────── tables ─────────
-- Departments. Order = display order + colour. `unit` = what the department's total on the TV counts
-- (jobs in that unit are added up; jobs in other units are shown on their own).
create table if not exists public.departments (
  name text primary key check (name <> '' and position(',' in name) = 0),
  unit text not null default 'pcs',
  sort int  not null default 0
);

-- The rows of the daily sheet: department ➜ machine (optional) ➜ job, each with its own unit.
-- Removing a job only hides it (active = false), so its history stays.
create table if not exists public.jobs (
  id         serial primary key,
  department text    not null,
  machine    text    not null default '',
  name       text    not null check (name <> ''),
  unit       text    not null default 'pcs',
  sort       int     not null default 0,
  active     boolean not null default true
);

create table if not exists public.employees (
  name       text primary key,
  department text    not null default '',           -- one or more, main first: "Rolls, Packing"
  active     boolean not null default true,         -- false = hidden from the TV, history kept
  photo      text    not null default '',           -- small JPEG data URL (resized in the browser)
  sort       int     not null default 0,
  constraint photo_ok check (photo = '' or (length(photo) < 60000 and photo ~ '^(data:image/(jpeg|png|webp);base64,|https://)'))
);

-- One count per person, per job, per day.
create table if not exists public.entries (
  date       date    not null,
  employee   text    not null,
  job        int     not null references public.jobs (id),
  qty        numeric not null check (qty > 0),
  updated_at timestamptz not null default now(),
  primary key (date, employee, job)
);

-- Who may edit. Add people after creating their login (see README):
--   insert into public.admins (user_id, email) select id, email from auth.users where email = 'you@example.com';
create table if not exists public.admins (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  email    text,
  added_at timestamptz not null default now()
);

-- One row that changes whenever any data changes, so the TVs can check cheaply
-- every minute and only download everything when something is new.
create table if not exists public.meta (
  id         int primary key default 1 check (id = 1),
  changed_at timestamptz not null default now()
);
insert into public.meta (id) values (1) on conflict do nothing;
alter table public.meta add column if not exists jobs_seeded boolean not null default false;

-- Starting departments (only when there are none yet), plus any department already used by an employee.
insert into public.departments (name, unit, sort)
select * from (values ('Sheets', 'sheets', 1), ('Sets', 'sets', 2), ('Packing', 'boxes', 3), ('Rolls', 'rolls', 4), ('Clean', 'bags', 5), ('Stores', 'nos', 6)) v(name, unit, sort)
where not exists (select 1 from public.departments);
insert into public.departments (name, sort)
select d, 100 + row_number() over (order by d)
from (select distinct trim(x) d from public.employees, unnest(string_to_array(department, ',')) x) used
where d <> '' and position(',' in d) = 0 and not exists (select 1 from public.departments where name = used.d);

-- Starting jobs, as in the client's sheet ("SYSTEM - Production Performance Calculation 2026.xlsx").
-- Added once only, so jobs you rename or remove later are never brought back.
insert into public.jobs (department, machine, name, unit, sort)
select v.department, v.machine, v.name, v.unit, v.sort from (values
  ('Sheets',  'RT1', 'Blank', 'sheets', 1), ('Sheets', 'RT2', '1 color', 'sheets', 2), ('Sheets', '', '2 Color', 'sheets', 3),
  ('Sheets',  '', '3 Color', 'sheets', 4), ('Sheets', '', '4 Color', 'sheets', 5), ('Sheets', '', 'CF ink', 'sheets', 6),
  ('Sheets',  '', 'Impression', 'sheets', 7), ('Sheets', '', 'PR', 'pcs', 8), ('Sheets', '', 'Plate 10x24', 'plates', 9),
  ('Sheets',  'P2P', '1 color', 'sheets', 10),
  ('Sets',    'Collator 1', 'Blank', 'sets', 11), ('Sets', 'Collator 2', 'Printed', 'sets', 12), ('Sets', '', 'Printed Numbering', 'sets', 13),
  ('Sets',    '', 'Envelop Gluing', 'sets', 14), ('Sets', '', 'Envelop Collating', 'sets', 15),
  ('Packing', '', 'White Wrapping', 'packets', 16), ('Packing', '', 'Brown Wrapping', 'packets', 17),
  ('Packing', '', 'Blank', 'boxes', 18), ('Packing', '', 'Printed', 'boxes', 19), ('Packing', '', 'Printed Numbering', 'boxes', 20),
  ('Packing', '', 'Envelop Making', 'nos', 21), ('Packing', '', 'Cut sheet making', 'sheets', 22), ('Packing', '', 'Book making', 'sheets', 23),
  ('Packing', '', 'Sample', 'sheets', 24),
  ('Rolls',   'Bill roll 1', 'IWB', 'rolls', 25), ('Rolls', 'Bill roll 2', 'TH', 'rolls', 26), ('Rolls', '2ply Bill roll', '2ply', 'rolls', 27),
  ('Rolls',   '', 'Polythene Cut', 'sheets', 28), ('Rolls', '', 'Polythene Seal', 'sheets', 29),
  ('Clean',   '', 'Bags', 'bags', 30),
  ('Stores',  '', 'Reels', 'nos', 31), ('Stores', '', 'Boxes', 'nos', 32), ('Stores', '', 'PVC', 'nos', 33)
) v(department, machine, name, unit, sort)
where not (select jobs_seeded from public.meta where id = 1)
  and exists (select 1 from public.departments d where d.name = v.department)
  and not exists (select 1 from public.jobs j where j.department = v.department and j.machine = v.machine and j.name = v.name);
update public.meta set jobs_seeded = true where id = 1 and not jobs_seeded;

create or replace function public.touch_meta() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.meta set changed_at = clock_timestamp() where id = 1;
  return null;
end $$;

drop trigger if exists touch_meta on public.departments;
drop trigger if exists touch_meta on public.jobs;
drop trigger if exists touch_meta on public.employees;
drop trigger if exists touch_meta on public.entries;
create trigger touch_meta after insert or update or delete on public.departments for each statement execute function public.touch_meta();
create trigger touch_meta after insert or update or delete on public.jobs        for each statement execute function public.touch_meta();
create trigger touch_meta after insert or update or delete on public.employees   for each statement execute function public.touch_meta();
create trigger touch_meta after insert or update or delete on public.entries     for each statement execute function public.touch_meta();

-- ───────── logins, tasks and approvals ─────────
-- Employees sign in with a username + password (created by the admin in Admin ➜ Employees, through the
-- `admin-users` Edge Function). Their login is linked here; renaming the employee keeps the link.
alter table public.employees add column if not exists user_id  uuid unique references auth.users (id) on delete set null;
alter table public.employees add column if not exists username text unique;

-- TV screen accounts: can see every screen, change nothing.
create table if not exists public.viewers (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  username text unique,
  label    text not null default '',
  added_at timestamptz not null default now()
);

-- Each employee's standing list of tasks (what they report on in the app).
create table if not exists public.assignments (
  employee    text not null,
  job         int  not null references public.jobs (id),
  assigned_at timestamptz not null default now(),
  primary key (employee, job)
);

-- Counts employees send from the app. The admin approves, changes or rejects them;
-- approved ones (with the admin's number when changed) go into `entries`, which is what the screens show.
create table if not exists public.submissions (
  id           bigserial primary key,
  date         date    not null,
  employee     text    not null,
  job          int     not null references public.jobs (id),
  qty          numeric not null check (qty > 0),          -- what the employee sent
  status       text    not null default 'pending' check (status in ('pending', 'approved', 'edited', 'rejected')),
  final_qty    numeric,                                    -- what was approved (the admin's number when edited)
  note         text    not null default '',                -- the admin's reason when changing or rejecting
  submitted_at timestamptz not null default now(),
  reviewed_at  timestamptz,
  reviewed_by  uuid,
  unique (date, employee, job)
);
create index if not exists submissions_pending on public.submissions (status) where status = 'pending';

-- Notification inbox, one row per person. A Database Webhook on INSERT calls the `push` Edge Function,
-- which sends it to that person's phone(s).
create table if not exists public.notifications (
  id         bigserial primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null,
  body       text not null default '',
  kind       text not null default '',
  data       jsonb not null default '{}',
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists notifications_user on public.notifications (user_id, created_at desc);

-- Phones registered for push notifications (Firebase tokens).
create table if not exists public.devices (
  token      text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  platform   text not null default 'android',
  updated_at timestamptz not null default now()
);

-- ───────── security ─────────
-- Nothing can be read without signing in. Admins and TV accounts see everything; an employee sees only
-- their own rows. Only admins change the factory data; employees only send counts through submit_count().
create or replace function public.is_admin() returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;
-- Admin or TV account: may see every screen
create or replace function public.is_viewer() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()))
      or exists (select 1 from public.viewers where user_id = (select auth.uid()));
$$;
-- The employee this login belongs to (null for admins / TV accounts)
create or replace function public.my_employee() returns text
language sql stable security definer set search_path = '' as $$
  select name from public.employees where user_id = (select auth.uid());
$$;

alter table public.departments   enable row level security;
alter table public.jobs          enable row level security;
alter table public.employees     enable row level security;
alter table public.entries       enable row level security;
alter table public.admins        enable row level security;
alter table public.meta          enable row level security;
alter table public.viewers       enable row level security;
alter table public.assignments   enable row level security;
alter table public.submissions   enable row level security;
alter table public.notifications enable row level security;
alter table public.devices       enable row level security;

revoke all on public.departments, public.jobs, public.employees, public.entries, public.admins, public.meta,
  public.viewers, public.assignments, public.submissions, public.notifications, public.devices from anon, authenticated;
grant select on public.departments, public.jobs, public.employees, public.entries, public.meta to authenticated;
grant insert, update, delete on public.departments, public.jobs, public.employees, public.entries to authenticated;
grant usage on sequence public.jobs_id_seq to authenticated;
grant select on public.admins to authenticated;

do $$
declare t text;
begin
  -- reads: signed in only (anon gets nothing)
  foreach t in array array['departments', 'jobs', 'meta'] loop
    execute format('drop policy if exists "read" on public.%I', t);
    execute format('create policy "read" on public.%I for select to authenticated using (true)', t);
  end loop;
  -- Separate insert / update / delete policies (not "for all"), so reads only ever check "read".
  foreach t in array array['departments', 'jobs', 'employees', 'entries'] loop
    execute format('drop policy if exists "admins insert" on public.%I', t);
    execute format('drop policy if exists "admins update" on public.%I', t);
    execute format('drop policy if exists "admins delete" on public.%I', t);
    execute format('create policy "admins insert" on public.%I for insert to authenticated with check ((select public.is_admin()))', t);
    execute format('create policy "admins update" on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t);
    execute format('create policy "admins delete" on public.%I for delete to authenticated using ((select public.is_admin()))', t);
  end loop;
end $$;
drop policy if exists "read" on public.employees;
create policy "read" on public.employees for select to authenticated using ((select public.is_viewer()) or user_id = (select auth.uid()));
drop policy if exists "read" on public.entries;
create policy "read" on public.entries for select to authenticated using ((select public.is_viewer()) or employee = (select public.my_employee()));

drop policy if exists "see own admin row" on public.admins;
create policy "see own admin row" on public.admins for select to authenticated using (user_id = (select auth.uid()));

-- ───────── API (called by assets/core.js) ─────────
-- Who is signed in: admin, TV account and/or employee.
create or replace function public.whoami() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'admin',    exists (select 1 from public.admins  where user_id = (select auth.uid())),
    'viewer',   exists (select 1 from public.viewers where user_id = (select auth.uid())),
    'employee', (select name from public.employees where user_id = (select auth.uid())),
    'username', coalesce((select username from public.employees where user_id = (select auth.uid())),
                         (select username from public.viewers   where user_id = (select auth.uid()))));
$$;

-- Everything the TV screens and the admin console need in one request: departments, jobs (removed ones too,
-- for history), people, and the last `days` days of entries as compact rows [date, employee, job id, qty].
create or replace function public.get_data(days int default 60) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not public.is_viewer() then
    raise exception 'This login can''t open the team screens' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'version',     (select changed_at from public.meta where id = 1),
    'departments', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'unit', unit) order by sort, name) from public.departments), '[]'::jsonb),
    'jobs',        coalesce((select jsonb_agg(jsonb_build_object('id', id, 'department', department, 'machine', machine, 'name', name, 'unit', unit, 'active', active) order by sort, id) from public.jobs), '[]'::jsonb),
    'employees',   coalesce((select jsonb_agg(jsonb_build_object('name', name, 'department', department, 'active', active, 'photo', photo) order by sort, name) from public.employees), '[]'::jsonb),
    'entries',     coalesce((select jsonb_agg(jsonb_build_array(to_char(date, 'YYYY-MM-DD'), employee, job, qty) order by date)
                             from public.entries where date >= current_date - least(greatest(days, 1), 4000)), '[]'::jsonb));
end $$;

-- Tiny check the TVs make every minute.
create or replace function public.data_version() returns timestamptz
language sql stable security invoker set search_path = '' as $$
  select changed_at from public.meta where id = 1;
$$;

-- "RT1 Blank" — machine (if any) and task name
create or replace function public.job_label(j int) returns text
language sql stable security definer set search_path = '' as $$
  select concat_ws(' ', nullif(machine, ''), name) from public.jobs where id = j;
$$;

-- 1500 ➜ "1,500", 12.5 ➜ "12.5" (for notification text)
create or replace function public.fmt_qty(q numeric) returns text
language sql immutable set search_path = '' as $$
  select case when q = trunc(q) then to_char(q, 'FM999,999,999,990') else rtrim(to_char(q, 'FM999,999,999,990.99'), '0') end;
$$;

-- Put a notification in someone's inbox (and, through the webhook, on their phone)
create or replace function public.notify(p_user uuid, p_title text, p_body text, p_kind text, p_data jsonb default '{}') returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, title, body, kind, data)
  select p_user, p_title, p_body, p_kind, coalesce(p_data, '{}') where p_user is not null;
$$;

-- Apply the admin's decision on a submission: final = the approved number, or null to reject.
-- Writes `entries` and tells the employee. Used by review_submission() and by save_entries().
create or replace function public.settle_submission(p_id bigint, p_final numeric, p_note text default '', p_touch_entries boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.submissions; st text; who uuid; u text;
begin
  select * into s from public.submissions where id = p_id;
  if not found then raise exception 'That submission no longer exists — reload the page'; end if;
  st := case when p_final is null then 'rejected' when p_final = s.qty then 'approved' else 'edited' end;
  update public.submissions set status = st, final_qty = p_final, note = coalesce(p_note, ''),
         reviewed_at = now(), reviewed_by = auth.uid() where id = p_id;
  if p_touch_entries then
    if p_final is null then
      delete from public.entries where date = s.date and employee = s.employee and job = s.job;
    else
      insert into public.entries (date, employee, job, qty, updated_at) values (s.date, s.employee, s.job, p_final, now())
      on conflict (date, employee, job) do update set qty = excluded.qty, updated_at = now();
    end if;
  end if;
  select user_id into who from public.employees where name = s.employee;
  select unit into u from public.jobs where id = s.job;
  perform public.notify(who,
    case st when 'approved' then 'Count approved' when 'edited' then 'Count changed by the admin' else 'Count rejected' end,
    public.job_label(s.job) || ' · ' || to_char(s.date, 'DD Mon') || ': ' ||
      case st when 'approved' then public.fmt_qty(p_final) || ' ' || u
              when 'edited'   then 'you sent ' || public.fmt_qty(s.qty) || ', approved ' || public.fmt_qty(p_final) || ' ' || u
              else public.fmt_qty(s.qty) || ' ' || u || ' not accepted' end ||
      case when coalesce(p_note, '') <> '' then ' — ' || p_note else '' end,
    'review', jsonb_build_object('submission', p_id, 'date', s.date, 'status', st));
end $$;

-- rows: [{employee, job, qty}] — an empty / 0 qty deletes that cell. Typing over a count an employee sent
-- counts as the admin's decision on it (approved, changed or — when cleared — rejected) and tells them.
create or replace function public.save_entries(p_date date, p_rows jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare r jsonb; q numeric; j int; e text; sid bigint; sst text; sfinal numeric;
begin
  if not public.is_admin() then raise exception 'Not allowed: this account is not an admin' using errcode = '42501'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    q := nullif(r->>'qty', '')::numeric;
    j := (r->>'job')::int;
    e := trim(r->>'employee');
    if not exists (select 1 from public.jobs where id = j) then raise exception 'A task was removed meanwhile — reload the page'; end if;
    if q is not null and q < 0 then raise exception 'Invalid count for %', e; end if;
    if q is null or q = 0 then
      delete from public.entries where date = p_date and employee = e and job = j;
    else
      insert into public.entries (date, employee, job, qty, updated_at) values (p_date, e, j, q, now())
      on conflict (date, employee, job) do update set qty = excluded.qty, updated_at = now();
    end if;
    select id, status, final_qty into sid, sst, sfinal from public.submissions where date = p_date and employee = e and job = j;
    if sid is not null and not (sst = 'rejected' and (q is null or q = 0)) and coalesce(sfinal, -1) is distinct from coalesce(nullif(q, 0), -1) then
      perform public.settle_submission(sid, nullif(q, 0), '', false);
    end if;
  end loop;
end $$;

-- The admin's decision on one submission: action 'approve', 'edit' (with p_qty) or 'reject'.
-- Works on pending ones and, to correct a mistake, on ones already decided.
create or replace function public.review_submission(p_id bigint, p_action text, p_qty numeric default null, p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare s public.submissions;
begin
  if not public.is_admin() then raise exception 'Not allowed: this account is not an admin' using errcode = '42501'; end if;
  select * into s from public.submissions where id = p_id;
  if not found then raise exception 'That submission no longer exists — reload the page'; end if;
  if p_action = 'approve' then perform public.settle_submission(p_id, s.qty, p_note);
  elsif p_action = 'edit' then
    if p_qty is null or p_qty <= 0 then raise exception 'Enter the number to approve (more than 0)'; end if;
    perform public.settle_submission(p_id, p_qty, p_note);
  elsif p_action = 'reject' then perform public.settle_submission(p_id, null, p_note);
  else raise exception 'Unknown action %', p_action;
  end if;
end $$;

-- An employee sends (or changes, while still pending) their count for one of their tasks.
-- p_qty empty / 0 withdraws a pending count. Approved counts are locked; only the admin can change them.
create or replace function public.submit_count(p_date date, p_job int, p_qty numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text; s public.submissions; u text; a uuid;
begin
  me := public.my_employee();
  if me is null then raise exception 'This login isn''t linked to an employee' using errcode = '42501'; end if;
  if p_date > current_date + 1 or p_date < current_date - 7 then raise exception 'Counts can be sent for today and the last 7 days only'; end if;
  if not exists (select 1 from public.assignments x join public.jobs j on j.id = x.job where x.employee = me and x.job = p_job and j.active) then
    raise exception 'That task isn''t assigned to you';
  end if;
  if p_qty is not null and p_qty < 0 then raise exception 'The count can''t be negative'; end if;
  select * into s from public.submissions where date = p_date and employee = me and job = p_job;
  if found and s.status in ('approved', 'edited') then
    raise exception 'This count is already approved — ask the admin to change it';
  end if;
  if p_qty is null or p_qty = 0 then
    delete from public.submissions where date = p_date and employee = me and job = p_job and status in ('pending', 'rejected');
    return null;
  end if;
  insert into public.submissions (date, employee, job, qty) values (p_date, me, p_job, p_qty)
  on conflict (date, employee, job) do update
    set qty = excluded.qty, status = 'pending', final_qty = null, note = '', submitted_at = now(), reviewed_at = null, reviewed_by = null
  returning * into s;
  select unit into u from public.jobs where id = p_job;
  for a in select user_id from public.admins loop
    perform public.notify(a, me || ' sent a count',
      public.job_label(p_job) || ': ' || public.fmt_qty(p_qty) || ' ' || u || ' · ' || to_char(p_date, 'DD Mon'),
      'submission', jsonb_build_object('submission', s.id, 'date', p_date));
  end loop;
  return to_jsonb(s);
end $$;

-- An employee's own page: their row, their tasks, their counts (with each task's daily average across
-- everyone, for the colours), their recent submissions and how many unread notifications they have.
create or replace function public.me(days int default 400) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me text; since date := current_date - least(greatest(days, 1), 4000);
begin
  me := public.my_employee();
  if me is null then raise exception 'This login isn''t linked to an employee' using errcode = '42501'; end if;
  return jsonb_build_object(
    'version',     (select changed_at from public.meta where id = 1),
    'departments', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'unit', unit) order by sort, name) from public.departments), '[]'::jsonb),
    'jobs',        coalesce((select jsonb_agg(jsonb_build_object('id', id, 'department', department, 'machine', machine, 'name', name, 'unit', unit, 'active', active) order by sort, id) from public.jobs), '[]'::jsonb),
    'employees',   coalesce((select jsonb_agg(jsonb_build_object('name', name, 'department', department, 'active', active, 'photo', photo, 'username', username)) from public.employees where name = me), '[]'::jsonb),
    'assignments', coalesce((select jsonb_agg(x.job order by j.sort, j.id) from public.assignments x join public.jobs j on j.id = x.job where x.employee = me and j.active), '[]'::jsonb),
    'entries',     coalesce((select jsonb_agg(jsonb_build_array(to_char(date, 'YYYY-MM-DD'), employee, job, qty) order by date)
                             from public.entries where employee = me and date >= since), '[]'::jsonb),
    'job_days',    coalesce((select jsonb_agg(jsonb_build_array(x.d, x.job, x.n, x.total))
                             from (select to_char(e.date, 'YYYY-MM-DD') d, e.job, count(*)::int n, sum(e.qty) total
                                   from public.entries e
                                   where e.date >= since and exists (select 1 from public.entries m where m.employee = me and m.date = e.date and m.job = e.job)
                                   group by e.date, e.job) x), '[]'::jsonb),
    'submissions', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'date', to_char(date, 'YYYY-MM-DD'), 'job', job, 'qty', qty, 'status', status,
                                     'final_qty', final_qty, 'note', note, 'submitted_at', submitted_at, 'reviewed_at', reviewed_at) order by date desc, id desc)
                             from public.submissions where employee = me and date >= current_date - 60), '[]'::jsonb),
    'unread',      (select count(*) from public.notifications where user_id = auth.uid() and read_at is null));
end $$;

-- What the admin console needs besides get_data(): logins, TV accounts, task lists, and submissions
-- (every pending one plus the last 30 days of decisions).
create or replace function public.admin_data() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Not allowed: this account is not an admin' using errcode = '42501'; end if;
  return jsonb_build_object(
    'logins',      coalesce((select jsonb_object_agg(name, username) from public.employees where user_id is not null), '{}'::jsonb),
    'viewers',     coalesce((select jsonb_agg(jsonb_build_object('username', username, 'label', label) order by added_at) from public.viewers), '[]'::jsonb),
    'assignments', coalesce((select jsonb_agg(jsonb_build_array(employee, job)) from public.assignments), '[]'::jsonb),
    'submissions', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'date', to_char(date, 'YYYY-MM-DD'), 'employee', employee, 'job', job, 'qty', qty,
                                     'status', status, 'final_qty', final_qty, 'note', note, 'submitted_at', submitted_at, 'reviewed_at', reviewed_at)
                                     order by (status = 'pending') desc, date desc, submitted_at desc)
                             from public.submissions where status = 'pending' or date >= current_date - 30), '[]'::jsonb));
end $$;

-- The admin sets an employee's standing task list; newly added tasks are sent to them as a notification.
create or replace function public.save_assignments(p_employee text, p_jobs int[]) returns void
language plpgsql security definer set search_path = '' as $$
declare added int[]; who uuid;
begin
  if not public.is_admin() then raise exception 'Not allowed: this account is not an admin' using errcode = '42501'; end if;
  if not exists (select 1 from public.employees where name = p_employee) then raise exception 'No employee called %', p_employee; end if;
  p_jobs := coalesce(p_jobs, '{}');
  added := array(select j from unnest(p_jobs) j where not exists (select 1 from public.assignments where employee = p_employee and job = j));
  delete from public.assignments where employee = p_employee and not (job = any (p_jobs));
  insert into public.assignments (employee, job) select p_employee, j from unnest(added) j where exists (select 1 from public.jobs where id = j);
  select user_id into who from public.employees where name = p_employee;
  if array_length(added, 1) > 0 then
    perform public.notify(who, case when array_length(added, 1) = 1 then 'New task for you' else array_length(added, 1) || ' new tasks for you' end,
      (select string_agg(public.job_label(j), ', ') from unnest(added) j), 'assignment', jsonb_build_object('jobs', to_jsonb(added)));
  end if;
end $$;

-- Notifications: the signed-in person's latest ones, mark them read, and a cheap check for the badge.
create or replace function public.my_notifications(p_limit int default 50) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'body', body, 'kind', kind, 'data', data,
                                               'created_at', created_at, 'read', read_at is not null) order by created_at desc), '[]'::jsonb)
  from (select * from public.notifications where user_id = auth.uid() order by created_at desc limit least(greatest(p_limit, 1), 200)) n;
$$;
create or replace function public.read_notifications(p_ids bigint[] default null) returns void
language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
$$;
create or replace function public.inbox() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'unread',  (select count(*) from public.notifications where user_id = auth.uid() and read_at is null),
    'pending', case when public.is_admin() then (select count(*) from public.submissions where status = 'pending') end,
    'latest',  (select max(created_at) from public.notifications where user_id = auth.uid()));
$$;

-- A phone signs up for push notifications for whoever is signed in on it.
create or replace function public.register_device(p_token text, p_platform text default 'android') returns void
language sql security definer set search_path = '' as $$
  insert into public.devices (token, user_id, platform, updated_at)
  select p_token, auth.uid(), coalesce(p_platform, 'android'), now() where auth.uid() is not null and coalesce(p_token, '') <> ''
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
$$;
create or replace function public.unregister_device(p_token text) returns void
language sql security definer set search_path = '' as $$
  delete from public.devices where token = p_token and user_id = auth.uid();
$$;

-- rows: [{name, unit, renamedFrom?}] in display order — replaces the whole list.
-- A rename carries its jobs and people along; a removed department is taken off everyone's list
-- and its jobs are hidden (their counts stay in the database).
create or replace function public.save_departments(p_rows jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare r jsonb; keep text[];
begin
  if not public.is_admin() then raise exception 'Not allowed: this account is not an admin' using errcode = '42501'; end if;
  if exists (select 1 from jsonb_array_elements(p_rows) x where trim(coalesce(x->>'name', '')) = '' or position(',' in x->>'name') > 0) then
    raise exception 'Department names must not be empty or contain commas';
  end if;
  if (select count(distinct lower(trim(x->>'name'))) from jsonb_array_elements(p_rows) x) <> jsonb_array_length(p_rows) then
    raise exception 'Two departments have the same name';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    if coalesce(r->>'renamedFrom', '') <> '' and r->>'renamedFrom' <> trim(r->>'name') then
      update public.jobs set department = trim(r->>'name') where department = r->>'renamedFrom';
      update public.employees set department = array_to_string(array(
        select case when trim(x) = r->>'renamedFrom' then trim(r->>'name') else trim(x) end
        from unnest(string_to_array(department, ',')) with ordinality u(x, i) order by i), ', ')
      where r->>'renamedFrom' = any (select trim(x) from unnest(string_to_array(department, ',')) x);
    end if;
  end loop;
  keep := array(select trim(x->>'name') from jsonb_array_elements(p_rows) x);
  update public.jobs set active = false where active and not (department = any (keep));
  update public.employees set department = array_to_string(array(
    select trim(x) from unnest(string_to_array(department, ',')) with ordinality u(x, i) where trim(x) = any (keep) order by i), ', ')
  where exists (select 1 from unnest(string_to_array(department, ',')) x where trim(x) <> '' and not (trim(x) = any (keep)));
  delete from public.departments where true;
  insert into public.departments (name, unit, sort)
  select trim(x->>'name'), coalesce(nullif(trim(x->>'unit'), ''), 'pcs'), ord
  from jsonb_array_elements(p_rows) with ordinality as t(x, ord);
end $$;

-- rows: [{id?, department, machine, name, unit}] in display order — the full list of jobs in use.
-- Jobs left out are hidden, not deleted, so their history stays. A new job with the same department,
-- machine and name as a hidden one brings that one back, with its history.
create or replace function public.save_jobs(p_rows jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare r jsonb; ord int := 0; jid int; keep int[] := '{}';
begin
  if not public.is_admin() then raise exception 'Not allowed: this account is not an admin' using errcode = '42501'; end if;
  if exists (select 1 from jsonb_array_elements(p_rows) x where trim(coalesce(x->>'name', '')) = '') then
    raise exception 'Every task needs a name';
  end if;
  if exists (select 1 from jsonb_array_elements(p_rows) x where not exists (select 1 from public.departments d where d.name = x->>'department')) then
    raise exception 'A task belongs to a department that does not exist';
  end if;
  if (select count(distinct lower(x->>'department') || '|' || lower(trim(coalesce(x->>'machine', ''))) || '|' || lower(trim(x->>'name'))) from jsonb_array_elements(p_rows) x) <> jsonb_array_length(p_rows) then
    raise exception 'The same task is listed twice in one department';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    ord := ord + 1;
    jid := nullif(r->>'id', '')::int;
    if jid is null then
      select id into jid from public.jobs
      where not active and department = r->>'department' and lower(machine) = lower(trim(coalesce(r->>'machine', ''))) and lower(name) = lower(trim(r->>'name'))
      order by id desc limit 1;
    end if;
    if jid is null then
      insert into public.jobs (department, machine, name, unit, sort)
      values (r->>'department', trim(coalesce(r->>'machine', '')), trim(r->>'name'), coalesce(nullif(trim(r->>'unit'), ''), 'pcs'), ord)
      returning id into jid;
    else
      update public.jobs set department = r->>'department', machine = trim(coalesce(r->>'machine', '')), name = trim(r->>'name'),
        unit = coalesce(nullif(trim(r->>'unit'), ''), 'pcs'), sort = ord, active = true
      where id = jid;
    end if;
    keep := keep || jid;
  end loop;
  update public.jobs set active = false where active and not (id = any (keep));
end $$;

-- rows: [{name, department, active, photo, renamedFrom?}] in display order — the whole list.
-- Updates people in place so their logins stay linked; a rename moves their history, task list and
-- submissions to the new name. People left out are removed (their counts stay in the database).
create or replace function public.save_employees(p_rows jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare r jsonb; ord int := 0; nm text; old text;
begin
  if not public.is_admin() then raise exception 'Not allowed: this account is not an admin' using errcode = '42501'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    ord := ord + 1;
    nm := trim(coalesce(r->>'name', ''));
    if nm = '' then continue; end if;
    old := nullif(r->>'renamedFrom', '');
    if old is not null and old <> nm and exists (select 1 from public.employees where name = old) then
      update public.employees set name = nm where name = old;
      update public.entries     set employee = nm where employee = old;
      update public.assignments set employee = nm where employee = old;
      update public.submissions set employee = nm where employee = old;
    end if;
    insert into public.employees (name, department, active, photo, sort)
    values (nm, coalesce(r->>'department', ''), coalesce((r->>'active')::boolean, true), coalesce(r->>'photo', ''), ord)
    on conflict (name) do update set department = excluded.department, active = excluded.active, photo = excluded.photo, sort = excluded.sort;
  end loop;
  delete from public.assignments where employee not in (select trim(x->>'name') from jsonb_array_elements(p_rows) x);
  delete from public.employees   where name     not in (select trim(x->>'name') from jsonb_array_elements(p_rows) x);
end $$;

revoke execute on function public.save_entries(date, jsonb), public.save_departments(jsonb), public.save_jobs(jsonb), public.save_employees(jsonb),
  public.review_submission(bigint, text, numeric, text), public.admin_data(), public.save_assignments(text, int[]),
  public.submit_count(date, int, numeric), public.me(int), public.whoami(), public.get_data(int), public.data_version(),
  public.my_notifications(int), public.read_notifications(bigint[]), public.inbox(), public.register_device(text, text), public.unregister_device(text),
  public.is_viewer(), public.my_employee()
  from public, anon;
grant execute on function public.save_entries(date, jsonb), public.save_departments(jsonb), public.save_jobs(jsonb), public.save_employees(jsonb),
  public.review_submission(bigint, text, numeric, text), public.admin_data(), public.save_assignments(text, int[]),
  public.submit_count(date, int, numeric), public.me(int), public.whoami(), public.get_data(int), public.data_version(),
  public.my_notifications(int), public.read_notifications(bigint[]), public.inbox(), public.register_device(text, text), public.unregister_device(text),
  public.is_viewer(), public.my_employee()
  to authenticated;
-- internal helpers: never called directly
revoke execute on function public.notify(uuid, text, text, text, jsonb), public.fmt_qty(numeric), public.settle_submission(bigint, numeric, text, boolean), public.job_label(int)
  from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
revoke execute on function public.touch_meta() from public, anon, authenticated;
