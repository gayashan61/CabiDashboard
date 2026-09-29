-- ─────────────────────────────────────────────────────────────
--  Starting employees (from "Production Performance Calculation 2026.xlsx")
--  Run once in Supabase ➜ SQL Editor, after schema.sql — only for a brand-new project.
--  Only fills an empty table, so running it again never overwrites your changes.
--  Departments come from schema.sql; edit both in Admin ➜ Departments / Employees.
-- ─────────────────────────────────────────────────────────────

insert into public.employees (name, department, sort)
select * from (values
  ('Isitha', 'Sheets', 1),
  ('Lakmal', 'Sheets', 2),
  ('Akila', 'Sheets', 3),
  ('Sanjeewa', 'Sets', 4),
  ('Nandani', 'Sets', 5),
  ('Avishka', 'Sheets', 6),
  ('Mahesh', 'Sheets', 7),
  ('Piyal', 'Rolls', 8),
  ('Dilhani', 'Packing', 9),
  ('Senuri', 'Packing', 10),
  ('Hansani', 'Packing', 11),
  ('Miyuri', 'Packing', 12),
  ('Upali', 'Packing', 13),
  ('Heshan', 'Packing', 14),
  ('Randika', 'Packing', 15),
  ('Hansika', 'Packing', 16),
  ('Raja', 'Packing', 17)
) v(name, department, sort)
where not exists (select 1 from public.employees);
