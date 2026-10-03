// Logins / tasks / approvals: upgrade from the deployed schema, then exercise every role.
import { fileURLToPath } from "url";
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
const repo = fileURLToPath(new URL("..", import.meta.url)) + "supabase/";
const db = new PGlite();
const results = [];
const check = (ok, label, extra = "") => { results.push(ok); console.log(ok ? "ok  " : "FAIL", label, extra === "" ? "" : typeof extra === "string" ? extra : JSON.stringify(extra)); };
const U = { admin: "11111111-1111-1111-1111-111111111111", tv: "22222222-2222-2222-2222-222222222222", chamara: "33333333-3333-3333-3333-333333333333",
            nuwan: "44444444-4444-4444-4444-444444444444", nobody: "55555555-5555-5555-5555-555555555555" };

// Supabase stand-ins: roles, auth.users, auth.uid() from a setting, the usual grants
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema public to anon, authenticated; grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
  insert into auth.users values ${Object.entries(U).map(([k, v]) => `('${v}', '${k}@tiljay.local')`).join(",")};`);
const as = async (who) => {
  await db.exec(`reset role; set test.uid = '${who === "anon" ? "" : U[who]}'`);
  await db.exec(`set role ${who === "anon" ? "anon" : "authenticated"}`);
};
const q = async (sql, who = null) => { if (who) await as(who); return (await db.query(sql)).rows; };
const one = async (sql, who) => (await q(sql, who))[0];
const err = async (sql, who) => { try { await q(sql, who); return null; } catch (e) { return e.message; } };
const asOwner = async () => db.exec("reset role; set test.uid = ''");

process.on('uncaughtException', (e) => { console.log('CRASH:', e.message, e.query || ''); process.exit(1); });
process.on('unhandledRejection', (e) => { console.log('CRASH:', e.message, e.query || ''); process.exit(1); });
// 1. Today's live database (deployed schema + live-like rows)
await db.exec(fs.readFileSync(new URL("fixtures/schema-before-logins.sql", import.meta.url), "utf8"));
await db.exec(`insert into admins (user_id, email) values ('${U.admin}', 'admin@example.com');
  insert into employees (name, department, sort) values ('Chamara','Sheets, Sets',1),('Nuwan','Sheets',2),('Gamini','Packing, Sheets',3);`);
const rt1 = (await q("select id from jobs where machine='RT1'"))[0].id, rt2 = (await q("select id from jobs where machine='RT2'"))[0].id, box = (await q("select id from jobs where department='Packing' and name='Printed'"))[0].id;
await db.exec(`insert into entries (date, employee, job, qty) values (current_date - 1, 'Chamara', ${rt1}, 8000), (current_date - 1, 'Nuwan', ${rt1}, 12000), (current_date - 1, 'Gamini', ${box}, 26);`);
const before = JSON.stringify(await q("select * from entries order by employee")) + JSON.stringify(await q("select name, department, photo from employees order by name"));

// 2. Upgrade (twice: running again must be harmless)
const schema = fs.readFileSync(repo + "schema.sql", "utf8");
await db.exec(schema); await db.exec(schema);
const after = JSON.stringify(await q("select * from entries order by employee")) + JSON.stringify(await q("select name, department, photo from employees order by name"));
check(before === after, "upgrade keeps every count and employee");

// link logins (what the admin-users Edge Function does with the service key)
await db.exec(`update employees set user_id = '${U.chamara}', username = 'chamara' where name = 'Chamara';
  update employees set user_id = '${U.nuwan}', username = 'nuwan' where name = 'Nuwan';
  insert into viewers (user_id, username, label) values ('${U.tv}', 'tv1', 'Factory TV');`);

// 3. Reading
check(/permission denied/.test(await err("select get_data(60)", "anon")), "not signed in: no data at all", await err("select get_data(60)", "anon"));
check(/permission denied/.test(await err("select * from entries", "anon")), "not signed in: tables closed too");
check(/can't open the team screens/.test(await err("select get_data(60)", "nobody")), "a login with no role can't open the screens");
check((await q("select * from entries", "nobody")).length === 0, "…and sees no counts");
const tvData = (await one("select get_data(60) d", "tv")).d;
check(tvData.entries.length === 3 && tvData.employees.length === 3, "TV account sees everything", { entries: tvData.entries.length });
check(/not an admin/.test(await err(`select save_entries(current_date, '[]')`, "tv")), "TV account can't change anything");
check(/can't open the team screens/.test(await err("select get_data(60)", "chamara")), "employee can't open the team screens");
check(JSON.stringify((await q("select employee from entries", "chamara")).map((r) => r.employee)) === '["Chamara"]', "employee reads only their own counts");
check((await q("select name from employees", "chamara")).map((r) => r.name).join() === "Chamara", "employee reads only their own employee row");
check((await one("select whoami() w", "chamara")).w.employee === "Chamara" && (await one("select whoami() w", "tv")).w.viewer === true && (await one("select whoami() w", "admin")).w.admin === true, "whoami tells the three roles apart");

// 4. Tasks: the admin assigns, the employee is told
check(/not an admin/.test(await err(`select save_assignments('Chamara', array[${rt1}])`, "chamara")), "employees can't assign tasks");
await q(`select save_assignments('Chamara', array[${rt1}, ${rt2}])`, "admin");
await asOwner(); let n = (await db.query(`select title, body from notifications where user_id = '${U.chamara}'`)).rows;
check(n.length === 1 && n[0].title === "2 new tasks for you" && /RT1 Blank, RT2 1 color/.test(n[0].body), "assigning tasks notifies the employee", n[0]);
await q(`select save_assignments('Chamara', array[${rt1}, ${rt2}])`, "admin");
await asOwner();
check((await db.query(`select count(*)::int c from notifications where user_id = '${U.chamara}'`)).rows[0].c === 1, "saving the same list again sends nothing new");

// 5. The employee sends counts
check(/isn't assigned to you/.test(await err(`select submit_count(current_date, ${box}, 10)`, "chamara")), "can't send a count for a task that isn't theirs");
check(/last 7 days/.test(await err(`select submit_count(current_date - 10, ${rt1}, 10)`, "chamara")), "can't send for 10 days ago");
check(/linked to an employee/.test(await err(`select submit_count(current_date, ${rt1}, 10)`, "tv")), "a TV account can't send counts");
const sub = (await one(`select submit_count(current_date, ${rt1}, 1500) s`, "chamara")).s;
check(sub.status === "pending", "count sent: pending", sub.status);
await one(`select submit_count(current_date, ${rt1}, 1600) s`, "chamara");
await asOwner();
const adminN = (await db.query(`select title, body from notifications where user_id = '${U.admin}' order by id`)).rows;
check(adminN.length === 2 && adminN[1].title === "Chamara sent a count" && /RT1 Blank: 1,600 sheets/.test(adminN[1].body), "admin is notified (and again on a change)", adminN[1]);
check((await db.query("select count(*)::int c from entries where date = current_date")).rows[0].c === 0, "pending counts are not on the screens yet");
const me1 = (await one("select me() m", "chamara")).m;
check(me1.assignments.length === 2 && me1.submissions[0].qty == 1600 && me1.entries.length === 1 && me1.unread === 1, "employee's page: tasks, the pending count, history", { a: me1.assignments.length, s: me1.submissions[0].status, unread: me1.unread });
const jd = me1.job_days.find((x) => x[1] === rt1);
check(jd && jd[2] === 2 && Number(jd[3]) === 20000, "…with the task's average across everyone (8,000 & 12,000 → 2 people, 20,000)", jd);

// 6. The admin decides
check(/not an admin/.test(await err(`select review_submission(${sub.id}, 'approve')`, "chamara")), "employees can't approve");
await q(`select review_submission(${sub.id}, 'approve')`, "admin");
await asOwner();
let e = (await db.query(`select qty from entries where date = current_date and employee = 'Chamara'`)).rows;
let last = (await db.query(`select title, body from notifications where user_id = '${U.chamara}' order by id desc limit 1`)).rows[0];
check(e.length === 1 && Number(e[0].qty) === 1600 && last.title === "Count approved" && /1,600 sheets/.test(last.body), "approve: on the screens, employee told", last);
check(/already approved/.test(await err(`select submit_count(current_date, ${rt1}, 9999)`, "chamara")), "approved counts are locked for the employee");
check(/already approved/.test(await err(`select submit_count(current_date, ${rt1}, null)`, "chamara")), "…and can't be withdrawn");
await q(`select review_submission(${sub.id}, 'edit', 1700, 'counted again')`, "admin");
await asOwner();
e = (await db.query(`select qty from entries where date = current_date and employee = 'Chamara'`)).rows;
last = (await db.query(`select title, body from notifications where user_id = '${U.chamara}' order by id desc limit 1`)).rows[0];
check(Number(e[0].qty) === 1700 && last.title === "Count changed by the admin" && /you sent 1,600, approved 1,700 sheets — counted again/.test(last.body), "admin can still change an approved count; employee told why", last.body);
await q(`select review_submission(${sub.id}, 'reject', null, 'wrong task')`, "admin");
await asOwner();
e = (await db.query(`select qty from entries where date = current_date and employee = 'Chamara'`)).rows;
const st = (await db.query(`select status from submissions where id = ${sub.id}`)).rows[0].status;
check(e.length === 0 && st === "rejected", "reject removes it from the screens");
const re = (await one(`select submit_count(current_date, ${rt1}, 1650) s`, "chamara")).s;
check(re.status === "pending" && re.id === sub.id, "after a rejection the employee can send again");
// admin types it in the grid instead of pressing Approve
await q(`select save_entries(current_date, '[{"employee":"Chamara","job":${rt1},"qty":1650}]')`, "admin");
await asOwner();
check((await db.query(`select status from submissions where id = ${sub.id}`)).rows[0].status === "approved", "typing the same number in Daily entry approves it");
await q(`select save_entries(current_date, '[{"employee":"Chamara","job":${rt1},"qty":null}]')`, "admin");
await asOwner();
check((await db.query(`select status from submissions where id = ${sub.id}`)).rows[0].status === "rejected", "clearing it in Daily entry rejects it");
await q(`select save_entries(current_date, '[{"employee":"Nuwan","job":${rt1},"qty":5}]')`, "admin");
check(true, "Daily entry still works for people who didn't send anything");

// 7. Notifications + devices
const myN = (await one("select my_notifications(10) n", "chamara")).n;
check(myN.length >= 5 && myN[0].read === false, "employee's notification list (newest first)", myN.length);
await q("select read_notifications(null)", "chamara");
check((await one("select inbox() i", "chamara")).i.unread === 0, "mark all read");
const adminInbox = (await one("select inbox() i", "admin")).i;
check(adminInbox.pending === 0 && adminInbox.unread >= 2, "admin inbox: pending count + unread", adminInbox);
await q(`select submit_count(current_date, ${rt2}, 300)`, "chamara");
check((await one("select inbox() i", "admin")).i.pending === 1, "new submission shows in the admin's pending count");
await q(`select register_device('tok-chamara-1', 'android')`, "chamara");
await asOwner();
check((await db.query(`select user_id from devices where token = 'tok-chamara-1'`)).rows[0].user_id === U.chamara, "phone registered for push");
check(/permission denied/.test(await err("select * from devices", "chamara")), "device tokens aren't readable directly");
check(/permission denied/.test(await err(`select notify('${U.admin}', 'x', 'y', 'z')`, "chamara")), "employees can't send notifications themselves");

// 8. Admin data + rename keeps the login
const ad = (await one("select admin_data() a", "admin")).a;
check(ad.logins.Chamara === "chamara" && ad.viewers[0].username === "tv1" && ad.assignments.length === 2 && ad.submissions.some((s) => s.status === "pending"), "admin_data: logins, TV accounts, tasks, submissions");
check(/not an admin/.test(await err("select admin_data()", "tv")), "admin_data is admin-only");
await asOwner();
const rows = (await db.query("select name, department, active, photo from employees order by sort")).rows.map((r) => ({ ...r, renamedFrom: r.name === "Chamara" ? "Chamara" : undefined }));
rows[0].name = "Chamara K";
await q(`select save_employees('${JSON.stringify(rows).replace(/'/g, "''")}')`, "admin");
await asOwner();
const ak = (await db.query("select name, user_id, username from employees where name = 'Chamara K'")).rows[0];
const moved = (await db.query("select (select count(*) from entries where employee='Chamara K')::int e, (select count(*) from assignments where employee='Chamara K')::int a, (select count(*) from submissions where employee='Chamara K')::int s")).rows[0];
check(ak && ak.user_id === U.chamara && moved.e >= 1 && moved.a === 2 && moved.s >= 1, "renaming keeps the login, counts, tasks and submissions", moved);
check((await one("select whoami() w", "chamara")).w.employee === "Chamara K", "…and the employee still signs in to the right profile");
await q(`select save_employees('${JSON.stringify(rows.filter((r) => r.name !== "Gamini")).replace(/'/g, "''")}')`, "admin");
await asOwner();
check((await db.query("select count(*)::int c from employees")).rows[0].c === 2, "removing an employee still works");

// 9. Other admin saves still work after the upgrade
const deps = (await q("select name, unit from departments order by sort", "admin"));
await q(`select save_departments('${JSON.stringify(deps)}')`, "admin");
const jobs = (await q("select id, department, machine, name, unit from jobs where active order by sort", "admin"));
await q(`select save_jobs('${JSON.stringify(jobs).replace(/'/g, "''")}')`, "admin");
check(true, "save_departments / save_jobs still work");
await asOwner();
const f = (await db.query("select fmt_qty(1500) a, fmt_qty(12.5) b, fmt_qty(0.25) c, fmt_qty(1234567) d")).rows[0];
check(f.a === "1,500" && f.b === "12.5" && f.c === "0.25" && f.d === "1,234,567", "numbers in notifications", f);

// 10. Fresh install still works
const fresh = new PGlite();
await fresh.exec(`create role anon nologin; create role authenticated nologin; create schema auth; create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`);
await fresh.exec(schema); await fresh.exec(fs.readFileSync(repo + "seed.sql", "utf8"));
check((await fresh.query("select count(*)::int c from jobs")).rows[0].c === 33, "fresh install: schema + seed");
console.log(results.every(Boolean) ? "\nALL PASSED" : `\n${results.filter((x) => !x).length} FAILED`);
