-- ─────────────────────────────────────────────────────────────
--  Production KPI Dashboard — Supabase database
--  Run this whole file once in Supabase ➜ SQL Editor ➜ New query ➜ Run.
--  It is safe to run again after updates (it only adds / replaces).
--  Then run seed.sql once to load the employees, targets and Excel data.
-- ─────────────────────────────────────────────────────────────

-- ───────── tables ─────────
create table if not exists public.employees (
  name       text primary key,
  department text    not null default '',           -- one or more, main first: "TH & 2ply, Packing"
  tasks      text[]  not null default '{}',
  active     boolean not null default true,         -- false = hidden from the TV, history kept
  photo      text    not null default '',           -- small JPEG data URL (resized in the browser)
  sort       int     not null default 0,
  constraint photo_ok check (photo = '' or (length(photo) < 60000 and photo ~ '^(data:image/(jpeg|png|webp);base64,|https://)'))
);

create table if not exists public.targets (
  task       text primary key,
  target     numeric not null check (target > 0),   -- what one person makes in a full day on this task
  department text,                                  -- which department this task counts for (people in 2 departments)
  sort       int     not null default 0
);

create table if not exists public.entries (
  date       date    not null,
  employee   text    not null,
  task       text    not null,
  qty        numeric not null check (qty > 0),
  updated_at timestamptz not null default now(),
  primary key (date, employee, task)
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

create or replace function public.touch_meta() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.meta set changed_at = clock_timestamp() where id = 1;
  return null;
end $$;

drop trigger if exists touch_meta on public.employees;
drop trigger if exists touch_meta on public.targets;
drop trigger if exists touch_meta on public.entries;
create trigger touch_meta after insert or update or delete on public.employees for each statement execute function public.touch_meta();
create trigger touch_meta after insert or update or delete on public.targets   for each statement execute function public.touch_meta();
create trigger touch_meta after insert or update or delete on public.entries   for each statement execute function public.touch_meta();

-- ───────── security ─────────
-- Anyone with the site link can read (it is a wall display); only admins can change anything.
-- Security invoker: a signed-in user may read their own admins row (policy below), which is all this needs.
create or replace function public.is_admin() returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

alter table public.employees enable row level security;
alter table public.targets   enable row level security;
alter table public.entries   enable row level security;
alter table public.admins    enable row level security;
alter table public.meta      enable row level security;

revoke all on public.employees, public.targets, public.entries, public.admins, public.meta from anon, authenticated;
grant select on public.employees, public.targets, public.entries, public.meta to anon, authenticated;
grant insert, update, delete on public.employees, public.targets, public.entries to authenticated;
grant select on public.admins to authenticated;

do $$
declare t text;
begin
  foreach t in array array['employees', 'targets', 'entries', 'meta'] loop
    execute format('drop policy if exists "read" on public.%I', t);
    execute format('create policy "read" on public.%I for select to anon, authenticated using (true)', t);
  end loop;
  -- Separate insert / update / delete policies (not "for all"), so reads only ever check "read".
  foreach t in array array['employees', 'targets', 'entries'] loop
    execute format('drop policy if exists "admins write" on public.%I', t);
    execute format('drop policy if exists "admins insert" on public.%I', t);
    execute format('drop policy if exists "admins update" on public.%I', t);
    execute format('drop policy if exists "admins delete" on public.%I', t);
    execute format('create policy "admins insert" on public.%I for insert to authenticated with check ((select public.is_admin()))', t);
    execute format('create policy "admins update" on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t);
    execute format('create policy "admins delete" on public.%I for delete to authenticated using ((select public.is_admin()))', t);
  end loop;
end $$;

drop policy if exists "see own admin row" on public.admins;
create policy "see own admin row" on public.admins for select to authenticated using (user_id = (select auth.uid()));

-- ───────── API (called by assets/core.js) ─────────
-- Everything the screens need in one request: people, targets, and the last `days` days of entries.
-- Entries are compact rows [date, employee, task, qty] to keep downloads small.
create or replace function public.get_data(days int default 60) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'version',   (select changed_at from public.meta where id = 1),
    'employees', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'department', department, 'tasks', tasks, 'active', active, 'photo', photo) order by sort, name) from public.employees), '[]'::jsonb),
    'targets',   coalesce((select jsonb_agg(jsonb_build_object('task', task, 'target', target, 'department', department) order by sort, task) from public.targets), '[]'::jsonb),
    'entries',   coalesce((select jsonb_agg(jsonb_build_array(to_char(date, 'YYYY-MM-DD'), employee, task, qty) order by date)
                           from public.entries where date >= current_date - least(greatest(days, 1), 4000)), '[]'::jsonb)
  );
$$;

-- Tiny check the TVs make every minute.
create or replace function public.data_version() returns timestamptz
language sql stable security invoker set search_path = '' as $$
  select changed_at from public.meta where id = 1;
$$;

-- rows: [{employee, task, qty}] — an empty / 0 qty deletes that cell
create or replace function public.save_entries(p_date date, p_rows jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare r jsonb; q numeric;
begin
  if not public.is_admin() then raise exception 'Not allowed: this account is not an admin' using errcode = '42501'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    q := nullif(r->>'qty', '')::numeric;
    if q is not null and q < 0 then raise exception 'Invalid quantity for % / %', r->>'employee', r->>'task'; end if;
    if q is null or q = 0 then
      delete from public.entries where date = p_date and employee = trim(r->>'employee') and task = trim(r->>'task');
    else
      insert into public.entries (date, employee, task, qty, updated_at) values (p_date, trim(r->>'employee'), trim(r->>'task'), q, now())
      on conflict (date, employee, task) do update set qty = excluded.qty, updated_at = now();
    end if;
  end loop;
end $$;

-- rows: [{task, target, department}] in display order — replaces the whole list
create or replace function public.save_targets(p_rows jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Not allowed: this account is not an admin' using errcode = '42501'; end if;
  delete from public.targets where true;
  insert into public.targets (task, target, department, sort)
  select trim(x->>'task'), (x->>'target')::numeric, nullif(trim(coalesce(x->>'department', '')), ''), ord
  from jsonb_array_elements(p_rows) with ordinality as t(x, ord)
  where coalesce((x->>'target')::numeric, 0) > 0;
end $$;

-- rows: [{name, department, tasks[], active, photo, renamedFrom?}] in display order — replaces the whole list.
-- A rename moves that person's history to the new name.
create or replace function public.save_employees(p_rows jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'Not allowed: this account is not an admin' using errcode = '42501'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    if coalesce(r->>'renamedFrom', '') <> '' and r->>'renamedFrom' <> r->>'name' then
      update public.entries set employee = trim(r->>'name') where employee = r->>'renamedFrom';
    end if;
  end loop;
  delete from public.employees where true;
  insert into public.employees (name, department, tasks, active, photo, sort)
  select trim(x->>'name'), coalesce(x->>'department', ''),
         coalesce(array(select jsonb_array_elements_text(x->'tasks')), '{}'),
         coalesce((x->>'active')::boolean, true), coalesce(x->>'photo', ''), ord
  from jsonb_array_elements(p_rows) with ordinality as t(x, ord)
  where trim(coalesce(x->>'name', '')) <> '';
end $$;

revoke execute on function public.save_entries(date, jsonb), public.save_targets(jsonb), public.save_employees(jsonb) from public, anon;
grant execute on function public.save_entries(date, jsonb), public.save_targets(jsonb), public.save_employees(jsonb) to authenticated;
grant execute on function public.get_data(int), public.data_version() to anon, authenticated;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
revoke execute on function public.touch_meta() from public, anon, authenticated;
