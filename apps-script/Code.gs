/**
 * Production KPI Dashboard — Google Apps Script backend
 * ------------------------------------------------------
 * 1. Create a new Google Sheet → Extensions → Apps Script → paste this whole file.
 * 2. Run the function `setup` once (authorise when asked). It creates the tabs,
 *    imports the data from the original Excel file and sets a default password.
 * 3. Project Settings → Script properties → change ADMIN_PASSWORD.
 * 4. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone → Deploy.
 * 5. Copy the Web app URL (ends with /exec) into assets/config.js → API_URL.
 */

const SHEET_ENTRIES = 'Entries';
const SHEET_EMPLOYEES = 'Employees';
const SHEET_TARGETS = 'Targets';

// ───────────────────────── HTTP handlers ─────────────────────────

function doGet(e) {
  try {
    const action = (e.parameter.action || 'data');
    if (action === 'data') return json_(Object.assign({ ok: true }, readAll_(Number(e.parameter.days) || 60)));
    return json_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    checkPassword_(body.password);
    lock.waitLock(20000);
    switch (body.action) {
      case 'auth': return json_({ ok: true });
      case 'saveEntries': saveEntries_(body.date, body.rows || []); return json_({ ok: true });
      case 'saveTargets': saveTargets_(body.targets || {}); return json_({ ok: true });
      case 'saveEmployees': saveEmployees_(body.employees || []); return json_({ ok: true });
      default: return json_({ ok: false, error: 'Unknown action' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

// ───────────────────────── read ─────────────────────────

function readAll_(days) {
  const ss = SpreadsheetApp.getActive();
  const cutoff = Utilities.formatDate(new Date(Date.now() - days * 86400000), tz_(), 'yyyy-MM-dd');

  const emp = rows_(ss.getSheetByName(SHEET_EMPLOYEES)).map(function (r) {
    return {
      name: String(r[0]).trim(),
      department: String(r[1]).trim(),
      tasks: String(r[2]).split(',').map(function (s) { return s.trim(); }).filter(String),
      active: !(r[3] === false || String(r[3]).toUpperCase() === 'FALSE'),
      photo: String(r[4] || ''),
    };
  }).filter(function (e) { return e.name; });

  const targets = {};
  rows_(ss.getSheetByName(SHEET_TARGETS)).forEach(function (r) {
    if (r[0] !== '' && Number(r[1])) targets[String(r[0]).trim()] = Number(r[1]);
  });

  const entries = [];
  rows_(ss.getSheetByName(SHEET_ENTRIES)).forEach(function (r) {
    const d = dateStr_(r[0]);
    if (!d || d < cutoff) return;
    entries.push({ date: d, employee: String(r[1]).trim(), task: String(r[2]).trim(), qty: Number(r[3]) || 0 });
  });

  return { employees: emp, targets: targets, entries: entries };
}

// ───────────────────────── write ─────────────────────────

function saveEntries_(date, rows) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Bad date');
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_ENTRIES);
  const values = sh.getDataRange().getValues();
  const index = {};
  for (let i = 1; i < values.length; i++) {
    index[dateStr_(values[i][0]) + '|' + String(values[i][1]).trim() + '|' + String(values[i][2]).trim()] = i + 1; // sheet row
  }
  const now = new Date();
  const append = [], del = [];
  rows.forEach(function (r) {
    const key = date + '|' + String(r.employee).trim() + '|' + String(r.task).trim();
    const qty = r.qty === null || r.qty === '' ? null : Number(r.qty);
    if (qty !== null && (isNaN(qty) || qty < 0)) throw new Error('Invalid quantity for ' + r.employee + ' / ' + r.task);
    const row = index[key];
    if (row) {
      if (!qty) del.push(row);
      else sh.getRange(row, 4, 1, 2).setValues([[qty, now]]);
    } else if (qty) {
      append.push([date, String(r.employee).trim(), String(r.task).trim(), qty, now]);
    }
  });
  del.sort(function (a, b) { return b - a; }).forEach(function (r) { sh.deleteRow(r); });
  if (append.length) {
    const start = sh.getLastRow() + 1;
    sh.getRange(start, 1, append.length, 1).setNumberFormat('@');
    sh.getRange(start, 1, append.length, 5).setValues(append);
  }
}

function saveTargets_(targets) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_TARGETS);
  const rows = Object.keys(targets).map(function (k) { return [k, Number(targets[k])]; });
  sh.getRange(2, 1, Math.max(sh.getLastRow(), 2), 2).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, 2).setValues(rows);
}

function saveEmployees_(list) {
  const ss = SpreadsheetApp.getActive();
  // Renames: keep history linked to the new name
  const renames = list.filter(function (e) { return e.renamedFrom; });
  if (renames.length) {
    const es = ss.getSheetByName(SHEET_ENTRIES);
    const n = es.getLastRow() - 1;
    if (n > 0) {
      const col = es.getRange(2, 2, n, 1).getValues();
      renames.forEach(function (r) { col.forEach(function (c) { if (String(c[0]).trim() === r.renamedFrom) c[0] = r.name; }); });
      es.getRange(2, 2, n, 1).setValues(col);
    }
  }
  const sh = ss.getSheetByName(SHEET_EMPLOYEES);
  if (!sh.getRange(1, 5).getValue()) sh.getRange(1, 5).setValue('Photo').setFontWeight('bold');
  const rows = list.map(function (e) {
    const photo = String(e.photo || '');
    if (photo && !/^(data:image\/(jpeg|png|webp);base64,|https:\/\/)/.test(photo)) throw new Error('Invalid photo for ' + e.name);
    if (photo.length > 49000) throw new Error('Photo for ' + e.name + ' is too large — please choose a smaller picture');
    return [e.name, e.department, (e.tasks || []).join(', '), e.active !== false, photo];
  });
  sh.getRange(2, 1, Math.max(sh.getLastRow(), 2), 5).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, 5).setValues(rows);
}

// ───────────────────────── helpers ─────────────────────────

function checkPassword_(pw) {
  const real = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (!real) throw new Error('Admin password not set — run setup()');
  if (pw !== real) { Utilities.sleep(1500); throw new Error('Wrong password'); }
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function rows_(sh) { if (!sh || sh.getLastRow() < 2) return []; return sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues(); }
function tz_() { return SpreadsheetApp.getActive().getSpreadsheetTimeZone() || Session.getScriptTimeZone(); }
function dateStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}

// ───────────────────────── one-time setup ─────────────────────────

function setup() {
  const ss = SpreadsheetApp.getActive();
  const make = function (name, header) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
    return sh;
  };
  const en = make(SHEET_ENTRIES, ['Date', 'Employee', 'Task', 'Qty', 'Updated']);
  const em = make(SHEET_EMPLOYEES, ['Name', 'Department', 'Tasks (comma separated)', 'Show on TV', 'Photo']);
  const tg = make(SHEET_TARGETS, ['Task', 'Daily target']);
  en.getRange('A:A').setNumberFormat('@');

  const seed = SEED_();
  if (em.getLastRow() < 2) em.getRange(2, 1, seed.employees.length, 4).setValues(seed.employees);
  if (tg.getLastRow() < 2) tg.getRange(2, 1, seed.targets.length, 2).setValues(seed.targets);
  if (en.getLastRow() < 2) {
    const now = new Date();
    en.getRange(2, 1, seed.entries.length, 5).setValues(seed.entries.map(function (r) { return r.concat([now]); }));
  }
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_PASSWORD')) props.setProperty('ADMIN_PASSWORD', 'change-me');
  const def = ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
  Logger.log('Setup done. Admin password is in Project Settings → Script properties → ADMIN_PASSWORD');
}

// Data imported from "Production Performance Calculation 2026.xlsx"
function SEED_() {
  return {"employees": [["Isitha", "Sheets", "RT Blank Sheets, RT Printed Sheets, P2P Printed 1 Colour", true], ["Lakmal", "Sheets", "RT Blank Sheets, RT Printed Sheets", true], ["Akila", "Sheets", "RT Blank Sheets, RT Printed Sheets, P2P Printed 1 Colour, Collating", true], ["Sanjeewa", "Sets", "RT Sheets (Sets), Collating, Numbering, Gluing", true], ["Nandani", "Sets", "Collating, TH, Packing", true], ["Avishka", "Sheets", "RT Blank Sheets, RT Printed Sheets, TH, 2ply", true], ["Mahesh", "Sheets", "RT Blank Sheets, RT Printed Sheets, TH, 2ply", true], ["Piyal", "TH & 2ply", "TH, 2ply, Packing Boxes, Sample", true], ["Dilhani", "Packing", "TH, Packing", true], ["Senuri", "Packing", "TH, Packing", true], ["Hansani", "Packing", "TH, Packing", true], ["Miyuri", "Packing", "2ply, TH, Sample, Packing", true], ["Upali", "Packing", "Packing", true], ["Heshan", "Packing", "TH, Packing, Sample, Cleaning", true], ["Randika", "Packing", "TH, Packing, Sample, Cleaning", true], ["Hansika", "Packing", "TH, Packing, Sample, Sheets PR, 10x24 Plate", true], ["Raja", "Packing", "Polythene Cut, Polythene Seal, Packing", true]], "targets": [["RT Blank Sheets", 120000], ["RT Printed Sheets", 120000], ["P2P Printed 1 Colour", 10000], ["RT Sheets (Sets)", 100000], ["Collating", 5000], ["Numbering", 35000], ["Gluing", 5000], ["TH", 60], ["2ply", 60], ["Packing", 150], ["Packing Boxes", 1000], ["Sample", 250], ["Cleaning", 100], ["Sheets PR", 15], ["10x24 Plate", 3], ["Polythene Cut", 1000], ["Polythene Seal", 1000]], "entries": [["2026-09-21", "Akila", "RT Blank Sheets", 140000], ["2026-09-21", "Dilhani", "Packing", 150], ["2026-09-21", "Hansani", "Packing", 150], ["2026-09-21", "Hansika", "10x24 Plate", 3], ["2026-09-21", "Hansika", "Packing", 50], ["2026-09-21", "Hansika", "Sample", 250], ["2026-09-21", "Hansika", "Sheets PR", 15], ["2026-09-21", "Heshan", "Packing", 200], ["2026-09-21", "Heshan", "Sample", 250], ["2026-09-21", "Isitha", "P2P Printed 1 Colour", 10000], ["2026-09-21", "Lakmal", "RT Printed Sheets", 100000], ["2026-09-21", "Miyuri", "Packing", 150], ["2026-09-21", "Miyuri", "Sample", 250], ["2026-09-21", "Nandani", "Collating", 5000], ["2026-09-21", "Nandani", "Packing", 1000], ["2026-09-21", "Nandani", "TH", 5000], ["2026-09-21", "Piyal", "2ply", 1000], ["2026-09-21", "Piyal", "Packing Boxes", 1000], ["2026-09-21", "Piyal", "Sample", 1000], ["2026-09-21", "Piyal", "TH", 1000], ["2026-09-21", "Sanjeewa", "Numbering", 35000], ["2026-09-21", "Senuri", "Packing", 150], ["2026-09-21", "Upali", "Packing", 200], ["2026-09-22", "Akila", "RT Printed Sheets", 150050], ["2026-09-22", "Isitha", "RT Blank Sheets", 113500], ["2026-09-22", "Lakmal", "RT Printed Sheets", 150050], ["2026-09-25", "Nandani", "Packing", 60], ["2026-09-25", "Nandani", "TH", 60], ["2026-09-25", "Piyal", "2ply", 60], ["2026-09-25", "Piyal", "TH", 60], ["2026-09-26", "Nandani", "Packing", 48], ["2026-09-26", "Nandani", "TH", 48], ["2026-09-26", "Piyal", "2ply", 48], ["2026-09-26", "Piyal", "TH", 48], ["2026-09-27", "Nandani", "Packing", 58], ["2026-09-27", "Nandani", "TH", 58], ["2026-09-27", "Piyal", "2ply", 58], ["2026-09-27", "Piyal", "TH", 58], ["2026-09-28", "Nandani", "Packing", 25], ["2026-09-28", "Nandani", "TH", 25], ["2026-09-28", "Piyal", "2ply", 25], ["2026-09-28", "Piyal", "TH", 25], ["2026-09-29", "Nandani", "Packing", 73], ["2026-09-29", "Nandani", "TH", 73], ["2026-09-29", "Piyal", "2ply", 73], ["2026-09-29", "Piyal", "TH", 73], ["2026-09-30", "Nandani", "Packing", 40], ["2026-09-30", "Nandani", "TH", 40], ["2026-09-30", "Piyal", "2ply", 40], ["2026-09-30", "Piyal", "TH", 40], ["2026-10-01", "Nandani", "Packing", 57], ["2026-10-01", "Nandani", "TH", 57], ["2026-10-01", "Piyal", "2ply", 57], ["2026-10-01", "Piyal", "TH", 57], ["2026-10-02", "Nandani", "Packing", 64], ["2026-10-02", "Nandani", "TH", 64], ["2026-10-02", "Piyal", "2ply", 64], ["2026-10-02", "Piyal", "TH", 64], ["2026-10-03", "Nandani", "Packing", 48], ["2026-10-03", "Nandani", "TH", 48], ["2026-10-03", "Piyal", "2ply", 48], ["2026-10-03", "Piyal", "TH", 48], ["2026-10-04", "Nandani", "Packing", 54], ["2026-10-04", "Nandani", "TH", 54], ["2026-10-04", "Piyal", "2ply", 54], ["2026-10-04", "Piyal", "TH", 54], ["2026-10-05", "Nandani", "Packing", 42], ["2026-10-05", "Nandani", "TH", 42], ["2026-10-05", "Piyal", "2ply", 42], ["2026-10-05", "Piyal", "TH", 42], ["2026-10-06", "Nandani", "Packing", 31], ["2026-10-06", "Nandani", "TH", 31], ["2026-10-06", "Piyal", "2ply", 31], ["2026-10-06", "Piyal", "TH", 31], ["2026-10-07", "Nandani", "Packing", 62], ["2026-10-07", "Nandani", "TH", 62], ["2026-10-07", "Piyal", "2ply", 62], ["2026-10-07", "Piyal", "TH", 62], ["2026-10-08", "Nandani", "Packing", 53], ["2026-10-08", "Nandani", "TH", 53], ["2026-10-08", "Piyal", "2ply", 53], ["2026-10-08", "Piyal", "TH", 53], ["2026-10-09", "Nandani", "Packing", 72], ["2026-10-09", "Nandani", "TH", 72], ["2026-10-09", "Piyal", "2ply", 72], ["2026-10-09", "Piyal", "TH", 72], ["2026-10-10", "Nandani", "Packing", 69], ["2026-10-10", "Nandani", "TH", 69], ["2026-10-10", "Piyal", "2ply", 69], ["2026-10-10", "Piyal", "TH", 69], ["2026-10-11", "Nandani", "Packing", 58], ["2026-10-11", "Nandani", "TH", 58], ["2026-10-11", "Piyal", "2ply", 58], ["2026-10-11", "Piyal", "TH", 58], ["2026-10-12", "Nandani", "Packing", 71], ["2026-10-12", "Nandani", "TH", 71], ["2026-10-12", "Piyal", "2ply", 71], ["2026-10-12", "Piyal", "TH", 71], ["2026-10-13", "Nandani", "Packing", 60], ["2026-10-13", "Nandani", "TH", 60], ["2026-10-13", "Piyal", "2ply", 60], ["2026-10-13", "Piyal", "TH", 60], ["2026-10-14", "Nandani", "Packing", 64], ["2026-10-14", "Nandani", "TH", 64], ["2026-10-14", "Piyal", "2ply", 64], ["2026-10-14", "Piyal", "TH", 64]]};
}
