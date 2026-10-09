-- ─────────────────────────────────────────────────────────────
--  Example employees (made-up names) for a brand-new project: replace them with your own in Admin ➜ Employees
--  Run once in Supabase ➜ SQL Editor, after schema.sql — only for a brand-new project.
--  Only fills an empty table, so running it again never overwrites your changes.
--  Departments come from schema.sql; edit both in Admin ➜ Departments / Employees.
-- ─────────────────────────────────────────────────────────────

insert into public.employees (name, department, sort)
select * from (values
  ('Kasun', 'Sheets', 1),
  ('Nuwan', 'Sheets', 2),
  ('Chamara', 'Sheets', 3),
  ('Ruwan', 'Sets', 4),
  ('Tharushi', 'Sets', 5),
  ('Dinesh', 'Sheets', 6),
  ('Saman', 'Sheets', 7),
  ('Pradeep', 'Rolls', 8),
  ('Nimali', 'Packing', 9),
  ('Ishara', 'Packing', 10),
  ('Kavindi', 'Packing', 11),
  ('Sachini', 'Packing', 12),
  ('Gamini', 'Packing', 13),
  ('Lahiru', 'Packing', 14),
  ('Tharindu', 'Packing', 15),
  ('Dulani', 'Packing', 16),
  ('Sunil', 'Packing', 17)
) v(name, department, sort)
where not exists (select 1 from public.employees);
