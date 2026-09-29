-- ─────────────────────────────────────────────────────────────
--  Upgrade: "one count per department"  ➜  "one count per job" (like the client's Excel sheet)
--
--  • Adds the jobs table (the rows of the sheet: RT1 Blank, Boxes Printed …).
--  • Departments named as in the sheet: "TH & 2ply" becomes "Rolls", "Packings" becomes "Packing"
--    (in employee lists too), and Clean and Stores are added.
--  • Counts already entered per department are kept: each moves to a job called "Other" in that department.
--
--  Run once in Supabase ➜ SQL Editor, THEN run ../schema.sql (which adds the sheet's jobs).
--  Running it again later does nothing harmful.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.jobs (
  id         serial primary key,
  department text    not null,
  machine    text    not null default '',
  name       text    not null check (name <> ''),
  unit       text    not null default 'pcs',
  sort       int     not null default 0,
  active     boolean not null default true
);

-- Department names as in the sheet (departments, employee lists and any counts already entered)
do $$
declare r record;
begin
  for r in select * from (values ('TH & 2ply', 'Rolls'), ('Packings', 'Packing')) v(old, new) loop
    if exists (select 1 from public.departments where name = r.old) and not exists (select 1 from public.departments where name = r.new) then
      update public.departments set name = r.new where name = r.old;
    end if;
    update public.employees set department = array_to_string(array(
      select y from (select case when trim(x) = r.old then r.new else trim(x) end y, min(i) i
                     from unnest(string_to_array(department, ',')) with ordinality u(x, i) group by 1) z order by i), ', ')
    where r.old = any (select trim(x) from unnest(string_to_array(department, ',')) x);
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'entries' and column_name = 'department') then
      update public.entries set department = r.new where department = r.old;
    end if;
  end loop;
end $$;

update public.departments set unit = 'rolls' where name = 'Rolls' and unit = 'pcs';
update public.departments set unit = 'boxes' where name = 'Packing' and unit = 'pcs';
insert into public.departments (name, unit, sort)
select v.name, v.unit, coalesce((select max(sort) from public.departments), 0) + v.n
from (values ('Clean', 'bags', 1), ('Stores', 'nos', 2)) v(name, unit, n)
where not exists (select 1 from public.departments d where d.name = v.name);
update public.departments d set sort = v.sort
from (values ('Sheets', 1), ('Sets', 2), ('Packing', 3), ('Rolls', 4), ('Clean', 5), ('Stores', 6)) v(name, sort)
where d.name = v.name;
-- any other departments keep their order, after these six
update public.departments set sort = 100 + sort
where sort < 100 and name not in ('Sheets', 'Sets', 'Packing', 'Rolls', 'Clean', 'Stores');

-- Counts per department ➜ counts per job
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'entries' and column_name = 'department') then
    insert into public.jobs (department, name, unit, sort)
    select distinct e.department, 'Other', coalesce(d.unit, 'pcs'), 1000
    from public.entries e left join public.departments d on d.name = e.department;
    alter table public.entries add column job int;
    update public.entries e set job = j.id from public.jobs j where j.department = e.department and j.name = 'Other' and j.sort = 1000;
    alter table public.entries drop constraint entries_pkey;
    alter table public.entries drop column department;
    alter table public.entries alter column job set not null;
    alter table public.entries add primary key (date, employee, job);
    alter table public.entries add foreign key (job) references public.jobs (id);
  end if;
end $$;
