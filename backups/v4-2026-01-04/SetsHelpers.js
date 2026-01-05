/* Helpers for managing Sets sheet: ensure schema, validations, auto-assign exercises, replace exercise */

function ensureSetsSchema() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('Sets');
  if (!sh) {
    sh = ss.insertSheet('Sets');
    sh.appendRow(['ID', 'Glide_Wod_ID', 'Exercise', 'SetNumber', 'Reps', 'Load', 'Notes']);
    return {created: true, headers: sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0]};
  }
  // ensure headers (append missing headers at the end if absent)
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
  const desired = ['ID', 'Glide_Wod_ID', 'Exercise', 'Exercise_Display', 'SetNumber', 'Reps', 'Load', 'Notes'];
  let updated = false;
  desired.forEach((h) => {
    if (headers.indexOf(h) === -1) {
      // append the missing column at the end
      sh.insertColumnAfter(sh.getLastColumn());
      sh.getRange(1, sh.getLastColumn()).setValue(h);
      headers.push(h);
      updated = true;
    }
  });

  // If Exercise_Display still missing but SetNumber exists, insert Exercise_Display before SetNumber for clarity
  if (headers.indexOf('Exercise_Display') === -1) {
    // Insert Exercise_Display at column 4 (before SetNumber) to keep order stable
    sh.insertColumnBefore(4);
    sh.getRange(1,4).setValue('Exercise_Display');
    headers.splice(3, 0, 'Exercise_Display');
    updated = true;
  }

  if (updated) return {created: false, updated: true};
  return {created: false, headers: headers};
}

function applySetsDataValidation() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('Sets');
  if (!sh) return {error: 'Sets sheet not found'};
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
  const idxSetNumber = headers.indexOf('SetNumber');
  const idxReps = headers.indexOf('Reps');
  if (idxSetNumber === -1 && idxReps === -1) return {error: 'Columns not found'};

  // Clear previous validations in those columns
  const lastRow = Math.max(1000, sh.getMaxRows());
  if (idxSetNumber !== -1) {
    const range = sh.getRange(2, idxSetNumber+1, lastRow-1, 1);
    const rule = SpreadsheetApp.newDataValidation().requireNumberGreaterThan(0).setAllowInvalid(false).build();
    range.setDataValidation(rule);
  }
  if (idxReps !== -1) {
    const range = sh.getRange(2, idxReps+1, lastRow-1, 1);
    const rule = SpreadsheetApp.newDataValidation().requireNumberGreaterThan(0).setAllowInvalid(false).build();
    range.setDataValidation(rule);
  }
  return {status: 'ok'};
}

// Find candidate exercise name from ExerciceDB for a given Glide_Wod ID
function findExerciseForGlideId(glideId) {
  if (!glideId) return null;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const glide = ss.getSheetByName('Glide_Wod');
  const db = ss.getSheetByName('ExerciceDB');
  if (!glide || !db) return null;

  // read glide row with matching ID
  const glideData = glide.getDataRange().getValues();
  const header = glideData[0].map(h => String(h || '').trim());
  const idIdx = header.indexOf('ID');
  const equipIdx = header.indexOf('Equipment');
  const musIdx = header.indexOf('Muscles');
  if (idIdx === -1) return null;
  let row = null;
  for (let i=1;i<glideData.length;i++) {
    if (String(glideData[i][idIdx]) === String(glideId)) { row = glideData[i]; break; }
  }
  // If no glide row exists, proceed with empty equip/mus so we can fallback to generic candidates
  const equip = row && equipIdx !== -1 ? String(row[equipIdx] || '').toLowerCase() : '';
  const mus = row && musIdx !== -1 ? String(row[musIdx] || '').toLowerCase() : '';

  // search db for matching exercises
  const dbData = db.getDataRange().getValues();
  const dbHeader = dbData[0].map(h => String(h || '').toLowerCase());
  const nameIdx = dbHeader.indexOf('nom complet') !== -1 ? dbHeader.indexOf('nom complet') : 0;
  const equipDbIdx = dbHeader.indexOf('equipment') !== -1 ? dbHeader.indexOf('equipment') : dbHeader.indexOf('equip');
  const primaryIdx = dbHeader.indexOf('primary_muscle') !== -1 ? dbHeader.indexOf('primary_muscle') : dbHeader.indexOf('primary') !== -1 ? dbHeader.indexOf('primary') : -1;

  const idDbIdx = dbHeader.indexOf('id') !== -1 ? dbHeader.indexOf('id') : dbHeader.indexOf('identifier') !== -1 ? dbHeader.indexOf('identifier') : -1;

  let candidates = [];
  for (let i=1;i<dbData.length;i++) {
    const r = dbData[i];
    const rName = String(r[nameIdx] || '').trim();
    const rId = idDbIdx !== -1 ? String(r[idDbIdx] || '').trim() : (rName || '');
    const rEquip = equipDbIdx !== -1 ? String(r[equipDbIdx] || '').toLowerCase() : '';
    const rPrimary = primaryIdx !== -1 ? String(r[primaryIdx] || '').toLowerCase() : '';

    let matchEquip = false;
    if (!equip || equip === '' || rEquip === '') matchEquip = true; else if (rEquip.toLowerCase().includes(equip)) matchEquip = true;
    let matchMus = false;
    if (!mus || mus === '') matchMus = true; else if (rPrimary.toLowerCase().includes(mus) || rName.toLowerCase().includes(mus)) matchMus = true;

    if (matchEquip && matchMus && (rName || rId)) candidates.push({id: rId, name: rName});
  }
  if (candidates.length === 0) {
    // Try looser matching: equipment only
    for (let i=1;i<dbData.length;i++) {
      const r = dbData[i];
      const rName = String(r[nameIdx] || '').trim();
      const rId = idDbIdx !== -1 ? String(r[idDbIdx] || '').trim() : (rName || '');
      const rEquip = equipDbIdx !== -1 ? String(r[equipDbIdx] || '').toLowerCase() : '';
      if ((rName || rId) && rEquip && equip && rEquip.includes(equip)) candidates.push({id: rId, name: rName});
    }
  }
  if (candidates.length === 0) {
    // Last resort: any non-empty exercise
    for (let i=1;i<dbData.length;i++) {
      const r = dbData[i];
      const rName = String(r[nameIdx] || '').trim();
      const rId = idDbIdx !== -1 ? String(r[idDbIdx] || '').trim() : (rName || '');
      if (rName || rId) candidates.push({id: rId, name: rName});
    }
  }
  if (candidates.length === 0) return null;
  // pick a random one and return the ID (prefer numeric or existing key)
  const pick = candidates[Math.floor(Math.random()*candidates.length)];
  return pick.id || pick.name;
}

function autoAssignExercises() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('Sets');
  if (!sh) return {error: 'Sets missing'};
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h || '').trim());
  const idIdx = headers.indexOf('ID');
  const glideIdx = headers.indexOf('Glide_Wod_ID');
  const exIdx = headers.indexOf('Exercise');
  const exDisplayIdx = headers.indexOf('Exercise_Display');
  const updates = [];
  for (let i=1;i<data.length;i++) {
    const row = data[i];
    if ((!row[exIdx] || String(row[exIdx]).trim() === '') && row[glideIdx]) {
      const candidate = findExerciseForGlideId(String(row[glideIdx]));
      if (candidate) {
        sh.getRange(i+1, exIdx+1).setValue(candidate);
        // also write a human-friendly name to Exercise_Display
        let display = getExerciseDisplayName(candidate);
        if (exDisplayIdx !== -1) sh.getRange(i+1, exDisplayIdx+1).setValue(display);
        updates.push({row: i+1, exercise: candidate, display: display});
      }
    }
  }
  return {assigned: updates.length, details: updates};
}

function replaceExerciseForSet(setId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('Sets');
  if (!sh) return {error: 'Sets missing'};
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h || '').trim());
  const idIdx = headers.indexOf('ID');
  const glideIdx = headers.indexOf('Glide_Wod_ID');
  const exIdx = headers.indexOf('Exercise');
  if (idIdx === -1) return {error: 'ID col missing'};
  for (let i=1;i<data.length;i++) {
    if (String(data[i][idIdx]) === String(setId)) {
      const glideId = data[i][glideIdx];
      const candidate = findExerciseForGlideId(String(glideId));
      if (candidate) {
        sh.getRange(i+1, exIdx+1).setValue(candidate);
        const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
        const exDisplayIdx = headers.indexOf('Exercise_Display');
        let display = getExerciseDisplayName(candidate);
        if (exDisplayIdx !== -1) sh.getRange(i+1, exDisplayIdx+1).setValue(display);
        return {row: i+1, exercise: candidate, display: display};
      }
      return {error: 'no candidate'};
    }
  }
  return {error: 'set not found'};
}

// Wrapper for easy manual runs
function ensureSetsSchemaWrapper() { return ensureSetsSchema(); }
function applySetsDataValidationWrapper() { return applySetsDataValidation(); }
function autoAssignExercisesWrapper() { return autoAssignExercises(); }
function replaceExerciseWrapper(setId) { return replaceExerciseForSet(setId); }

// Dump a small snapshot of Sets rows for external inspection
function dumpSets(limit) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('Sets');
  if (!sh) return {error: 'Sets missing'};
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h || '').trim());
  const idIdx = headers.indexOf('ID');
  const glideIdx = headers.indexOf('Glide_Wod_ID');
  const exIdx = headers.indexOf('Exercise');
  const out = [];
  const lim = Math.min(limit || 200, data.length - 1);
  for (let i = 1; i <= lim; i++) {
    out.push({row: i+1, id: data[i][idIdx], glide: data[i][glideIdx], exercise: data[i][exIdx], exercise_display: (data[i].length > (exIdx+1) ? data[i][exIdx+1] : '')});
  }
  return out;
}

function getGlideInfo(glideId) {
  if (!glideId) return null;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('Glide_Wod');
  if (!sh) return null;
  const data = sh.getDataRange().getValues();
  const header = data[0].map(h => String(h || '').trim());
  const idIdx = header.indexOf('ID');
  const equipIdx = header.indexOf('Equipment');
  const musIdx = header.indexOf('Muscles');
  let row = null;
  for (let i=1;i<data.length;i++) {
    if (String(data[i][idIdx]) === String(glideId)) { row = data[i]; break; }
  }
  if (!row) return null;
  return {id: row[idIdx], equipment: (equipIdx !== -1 ? row[equipIdx] : ''), muscles: (musIdx !== -1 ? row[musIdx] : ''), rawRow: row};
}

// Given an ID or name, return human friendly ExerciceDB name (fallback to input)
function getExerciseDisplayName(key) {
  if (!key) return '';
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('ExerciceDB');
  if (!sh) return key;
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h || '').toLowerCase());
  const idIdx = headers.indexOf('id') !== -1 ? headers.indexOf('id') : -1;
  const nameIdx = headers.indexOf('nom complet') !== -1 ? headers.indexOf('nom complet') : headers.indexOf('name') !== -1 ? headers.indexOf('name') : 0;
  for (let i=1;i<data.length;i++) {
    if (idIdx !== -1 && String(data[i][idIdx]) === String(key)) return String(data[i][nameIdx] || '');
    if (String(data[i][nameIdx]) === String(key)) return String(data[i][nameIdx]);
  }
  // Fallback: if key is a positive integer, interpret it as row-based ID (row = key + 1)
  const asNum = parseInt(String(key), 10);
  if (!isNaN(asNum) && asNum > 0 && asNum < data.length) {
    return String(data[asNum][nameIdx] || key);
  }
  return String(key);
}

function dumpExerciceDB(limit) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('ExerciceDB');
  if (!sh) return {error: 'ExerciceDB missing'};
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h || '').trim());
  const idIdx = headers.map(h => h.toLowerCase()).indexOf('id');
  const nameIdx = headers.map(h => h.toLowerCase()).indexOf('nom complet') !== -1 ? headers.map(h => h.toLowerCase()).indexOf('nom complet') : headers.map(h => h.toLowerCase()).indexOf('name') !== -1 ? headers.map(h => h.toLowerCase()).indexOf('name') : 0;
  const equipIdx = headers.map(h => h.toLowerCase()).indexOf('equipment') !== -1 ? headers.map(h => h.toLowerCase()).indexOf('equipment') : headers.map(h => h.toLowerCase()).indexOf('equip');
  const primaryIdx = headers.map(h => h.toLowerCase()).indexOf('primary_muscle') !== -1 ? headers.map(h => h.toLowerCase()).indexOf('primary_muscle') : headers.map(h => h.toLowerCase()).indexOf('primary') !== -1 ? headers.map(h => h.toLowerCase()).indexOf('primary') : -1;
  const out = [];
  const lim = Math.min(limit || 50, data.length - 1);
  for (let i = 1; i <= lim; i++) {
    out.push({row: i+1, id: (idIdx !== -1 ? String(data[i][idIdx] || '') : ''), name: data[i][nameIdx], equip: (equipIdx !== -1 ? data[i][equipIdx] : ''), primary: (primaryIdx !== -1 ? data[i][primaryIdx] : '')});
  }
  return {headers: headers, rows: out};
}

// Force-assign a random exercise to a set regardless of matching
function forceAssignAnyExerciseToSet(setId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('Sets');
  const db = ss.getSheetByName('ExerciceDB');
  if (!sh || !db) return {error: 'missing sheet'};
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h || '').trim());
  const idIdx = headers.indexOf('ID');
  const exIdx = headers.indexOf('Exercise');
  const dbData = db.getDataRange().getValues();
  const dbHeader = dbData[0].map(h => String(h || '').toLowerCase());
  const nameIdx = dbHeader.indexOf('nom complet') !== -1 ? dbHeader.indexOf('nom complet') : dbHeader.indexOf('name') !== -1 ? dbHeader.indexOf('name') : 0;
  const idDbIdx = dbHeader.indexOf('id') !== -1 ? dbHeader.indexOf('id') : -1;
  // pick random non-empty id (prefer id if present)
  let candidates = [];
  for (let i=1;i<dbData.length;i++) {
    const rName = String(dbData[i][nameIdx] || '').trim();
    const rId = idDbIdx !== -1 ? String(dbData[i][idDbIdx] || '').trim() : (rName || '');
    if (rId) candidates.push({id: rId, name: rName});
  }
  if (candidates.length === 0) return {error: 'no exercises in DB'};
  const pick = candidates[Math.floor(Math.random()*candidates.length)];
  for (let i=1;i<data.length;i++) {
    if (String(data[i][idIdx]) === String(setId)) {
      sh.getRange(i+1, exIdx+1).setValue(pick.id || pick.name);
      // write friendly name if present
      const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
      const exDisplayIdx = headers.indexOf('Exercise_Display');
      if (exDisplayIdx !== -1) sh.getRange(i+1, exDisplayIdx+1).setValue(pick.name || pick.id);
      return {row: i+1, exercise: pick.id || pick.name, display: pick.name || pick.id};
    }
  }
  return {error: 'set not found'};
}

function ensureExerciceDBKey() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('ExerciceDB');
  if (!sh) return {error: 'ExerciceDB missing'};
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
  let idIdx = headers.map(h=>h.toLowerCase()).indexOf('id');

  // If ID header missing, insert as first column (do not populate yet)
  if (idIdx === -1) {
    sh.insertColumnBefore(1);
    sh.getRange(1,1).setValue('ID');
    idIdx = 0;
  }

  // Fill missing ID values with row-based sequential keys (row-1)
  const rows = sh.getLastRow();
  const valuesToSet = [];
  let filled = 0;
  const existing = sh.getRange(2, idIdx+1, rows-1, 1).getValues();
  for (let r=0; r<existing.length; r++) {
    const val = String(existing[r][0] || '').trim();
    if (val === '') {
      valuesToSet.push([r+1]);
      filled++;
    } else {
      valuesToSet.push([existing[r][0]]);
    }
  }
  if (valuesToSet.length > 0) sh.getRange(2, idIdx+1, valuesToSet.length,1).setValues(valuesToSet);

  return {status: 'ok', idCol: idIdx+1, rows: rows-1, filled: filled};
}

// Force-fill ExerciceDB ID values sequentially (row-1) regardless of current content
function fillExerciceDBSequentialIds() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('ExerciceDB');
  if (!sh) return {error: 'ExerciceDB missing'};
  const rows = sh.getLastRow();
  if (rows < 2) return {status: 'no_rows'};
  // Ensure ID header exists at column 1
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
  if (headers[0].toLowerCase() !== 'id') {
    sh.insertColumnBefore(1);
    sh.getRange(1,1).setValue('ID');
  }
  const values = [];
  for (let r=2; r<=rows; r++) values.push([String(r-1)]); // write as strings explicitly
  sh.getRange(2,1,values.length,1).setValues(values);
  return {status: 'filled', rows: values.length};
}

function fillExerciceDBSequentialIdsWrapper() { return fillExerciceDBSequentialIds(); }

// Aggressive force-fill that overwrites existing values with sequential string IDs
function forceFillExerciceDBIds() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('ExerciceDB');
  if (!sh) return {error: 'ExerciceDB missing'};
  const rows = sh.getLastRow();
  if (rows < 2) return {status: 'no_rows'};
  // Ensure ID header exists at column 1
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
  if (headers[0].toLowerCase() !== 'id') {
    sh.insertColumnBefore(1);
    sh.getRange(1,1).setValue('ID');
  }
  const values = [];
  for (let r=2; r<=rows; r++) values.push([String(r-1)]); // force overwrite
  sh.getRange(2,1,values.length,1).setValues(values);
  return {status: 'forced', rows: values.length};
}

function forceFillExerciceDBIdsWrapper() { return forceFillExerciceDBIds(); }

function getSpreadsheetForHelpers_() {
  // Prefer the container-bound spreadsheet when available.
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) return ss;
  } catch (e) {}

  // Fallback to the project helper (present in Code.js/Code.gs in this repo).
  try {
    if (typeof getSs === 'function') return getSs();
  } catch (e) {}

  // Last resort: open the known Fitbook spreadsheet.
  return SpreadsheetApp.openById('1o0jp22IWRGJ5siqpEbNvCd5R6t-kcXaWoPVZ0kzgFPA');
}

function backupSheetIfMissing_(ss, sheetName) {
  const sh = ss.getSheetByName(sheetName);
  if (!sh) return {error: 'Sheet not found: ' + sheetName};
  const stamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone() || 'Etc/UTC', 'yyyyMMdd_HHmmss');
  const backupName = sheetName + '_backup_' + stamp;
  const copy = sh.copyTo(ss);
  copy.setName(backupName);
  return {status: 'ok', backupName: backupName};
}

// Make duplicate ExerciceDB names unique (case/space-insensitive), without changing any other fields.
// This is meant to fix AppSheet UX ambiguity where labels repeat for different IDs.
// Strategy: keep the first occurrence unchanged; for subsequent duplicates, append " (ID <id>)".
// Also appends a trace tag to Modified_Auto if the column exists (creates it if missing).
function dedupeExerciceDBNames() {
  const ss = getSpreadsheetForHelpers_();
  const sh = ss.getSheetByName('ExerciceDB');
  if (!sh) return {error: 'ExerciceDB missing'};

  // Backup first (easy rollback).
  const backup = backupSheetIfMissing_(ss, 'ExerciceDB');

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2) return {status: 'no_rows', backup: backup};

  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
  const lower = headers.map(h => String(h || '').toLowerCase());

  const idIdx = lower.indexOf('id');
  const nameIdx = (lower.indexOf('name') !== -1) ? lower.indexOf('name') : (lower.indexOf('nom complet') !== -1 ? lower.indexOf('nom complet') : -1);
  if (idIdx === -1 || nameIdx === -1) {
    return {error: 'Missing required columns', hasId: idIdx !== -1, hasName: nameIdx !== -1, headers: headers, backup: backup};
  }

  // Ensure Modified_Auto exists
  let modIdx = lower.indexOf('modified_auto');
  if (modIdx === -1) {
    sh.insertColumnAfter(sh.getLastColumn());
    sh.getRange(1, sh.getLastColumn()).setValue('Modified_Auto');
    modIdx = sh.getLastColumn() - 1;
  }

  const data = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();

  function normName(v) {
    return String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  const seen = {};
  const updates = [];
  const nowTag = 'DEDUP_NAME_' + Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone() || 'Etc/UTC', 'yyyy-MM-dd');

  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    const idVal = String(row[idIdx] || '').trim();
    const nameVal = String(row[nameIdx] || '').trim();
    const key = normName(nameVal);
    if (!key) continue;

    if (!seen[key]) {
      seen[key] = true;
      continue;
    }

    const suffix = idVal ? (' (ID ' + idVal + ')') : ' (DUP)';
    const newName = nameVal + suffix;
    if (newName === nameVal) continue;

    row[nameIdx] = newName;

    const existingTag = String(row[modIdx] || '').trim();
    if (!existingTag) row[modIdx] = nowTag;
    else if (existingTag.indexOf(nowTag) === -1) row[modIdx] = existingTag + ';' + nowTag;

    updates.push({row: r + 2, id: idVal, from: nameVal, to: newName});
  }

  if (updates.length === 0) {
    return {status: 'ok', changed: 0, backup: backup};
  }

  sh.getRange(2, 1, data.length, sh.getLastColumn()).setValues(data);
  SpreadsheetApp.flush();
  return {status: 'ok', changed: updates.length, updates: updates.slice(0, 50), backup: backup};
}

function dedupeExerciceDBNamesWrapper() { return dedupeExerciceDBNames(); }

function getExerciceDBColumnStats() {
  const ss = getSpreadsheetForHelpers_();
  const sh = ss.getSheetByName('ExerciceDB');
  if (!sh) return {error: 'ExerciceDB missing'};

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return {status: 'empty_sheet'};

  const values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = values[0].map(h => String(h || '').trim());
  const lower = headers.map(h => String(h || '').toLowerCase());

  const nonEmptyCounts = {};
  for (let c = 0; c < headers.length; c++) nonEmptyCounts[headers[c] || ('col_' + (c + 1))] = 0;

  // Count non-empty cells for each column (excluding header row)
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    for (let c = 0; c < headers.length; c++) {
      const v = row[c];
      if (v !== null && v !== undefined && String(v).trim() !== '') nonEmptyCounts[headers[c] || ('col_' + (c + 1))]++;
    }
  }

  // Canonical columns we expect (based on the dataset schema in this repo)
  const wanted = [
    'Id',
    'name',
    'Discipline',
    'primary_muscle',
    'secondary_muscles',
    'core_engagement',
    'unilateral',
    'plyometric',
    'isometric',
    'knee_friendly',
    'spine_load',
    'body_category',
    'type',
    'level',
    'impact',
    'equipment',
    'movement_pattern',
    'tags',
    'avoid_if_knee_issues',
    'avoid_if_lower_back_issues',
    'description',
    'gif_url',
    'fallback_url',
    'fallback_url 2',
    'Fatigue',
    'Modified_Auto'
  ];

  // Treat these as equivalents (if any exist, we consider the slot satisfied)
  const equivalents = {
    'id': ['id', 'identifier', 'Id'],
    'name': ['name', 'nom complet', 'nom', 'exercise', 'exercice'],
    'fatigue': ['fatigue', 'Fatigue']
  };

  function hasAny(keys) {
    return keys.some(k => lower.indexOf(String(k).toLowerCase()) !== -1);
  }

  const missing = [];
  for (const col of wanted) {
    const lc = String(col).toLowerCase();
    if (equivalents[lc]) {
      if (!hasAny(equivalents[lc])) missing.push(col);
    } else {
      if (lower.indexOf(lc) === -1) missing.push(col);
    }
  }

  // Also report columns that are present but entirely empty
  const emptyColumns = [];
  Object.keys(nonEmptyCounts).forEach((k) => {
    if (nonEmptyCounts[k] === 0) emptyColumns.push(k);
  });

  return {
    status: 'ok',
    rows: Math.max(0, lastRow - 1),
    cols: lastCol,
    headers: headers,
    nonEmptyCounts: nonEmptyCounts,
    missingWantedColumns: missing,
    emptyColumns: emptyColumns
  };
}

// Ensures ExerciceDB has the canonical columns (adds missing headers only, does not write any row values).
// Creates a backup copy of the sheet for easy rollback.
function ensureExerciceDBColumnsMinimal() {
  const ss = getSpreadsheetForHelpers_();
  const sh = ss.getSheetByName('ExerciceDB');
  if (!sh) return {error: 'ExerciceDB missing'};

  const backup = backupSheetIfMissing_(ss, 'ExerciceDB');

  const lastCol = sh.getLastColumn();
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
  const lower = headers.map(h => String(h || '').toLowerCase());

  const wanted = [
    'Id',
    'name',
    'primary_muscle',
    'secondary_muscles',
    'core_engagement',
    'unilateral',
    'plyometric',
    'isometric',
    'knee_friendly',
    'spine_load',
    'body_category',
    'type',
    'level',
    'impact',
    'equipment',
    'movement_pattern',
    'tags',
    'avoid_if_knee_issues',
    'avoid_if_lower_back_issues',
    'description',
    'gif_url',
    'fallback_url',
    'fallback_url 2',
    'Fatigue',
    'Modified_Auto'
  ];

  const added = [];

  function hasAny(variants) {
    return variants.some(v => lower.indexOf(String(v).toLowerCase()) !== -1);
  }

  for (const col of wanted) {
    const lc = String(col).toLowerCase();
    // Avoid adding duplicates for common synonyms
    if (lc === 'id') {
      if (hasAny(['id', 'identifier', 'Id'])) continue;
    }
    if (lc === 'name') {
      if (hasAny(['name', 'nom complet', 'nom', 'exercise', 'exercice'])) continue;
    }
    if (lc === 'fatigue') {
      if (hasAny(['fatigue', 'Fatigue'])) continue;
    }

    if (lower.indexOf(lc) !== -1) continue;

    sh.insertColumnAfter(sh.getLastColumn());
    sh.getRange(1, sh.getLastColumn()).setValue(col);
    lower.push(lc);
    added.push(col);
  }

  SpreadsheetApp.flush();
  return {status: 'ok', added: added, backup: backup};
}

function ensureExerciceDBColumnsMinimalWrapper() { return ensureExerciceDBColumnsMinimal(); }

// Read-only audit of ExerciceDB equipment + Fatigue columns.
// Returns distributions and a list of suspicious rows (no sheet mutation).
function auditExerciceDBEquipmentFatigue(limitIssues) {
  const ss = getSpreadsheetForHelpers_();
  const sh = ss.getSheetByName('ExerciceDB');
  if (!sh) return {error: 'ExerciceDB missing'};

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2) return {status: 'no_rows'};

  const values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = values[0].map(h => String(h || '').trim());
  const lower = headers.map(h => String(h || '').toLowerCase());

  const idIdx = lower.indexOf('id');
  const nameIdx = (lower.indexOf('name') !== -1) ? lower.indexOf('name') : (lower.indexOf('nom complet') !== -1 ? lower.indexOf('nom complet') : -1);
  const equipIdx = (lower.indexOf('equipment') !== -1) ? lower.indexOf('equipment') : (lower.indexOf('equip') !== -1 ? lower.indexOf('equip') : -1);
  const fatigueIdx = lower.indexOf('fatigue');

  if (equipIdx === -1 || fatigueIdx === -1) {
    return {
      error: 'Missing columns',
      hasEquipment: equipIdx !== -1,
      hasFatigue: fatigueIdx !== -1,
      headers: headers
    };
  }

  function norm(v) {
    return String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  const allowedEquipment = {
    'bodyweight': true,
    'dumbbells': true,
    'band': true,
    'trx': true,
    'pilateswall': true,
    'bench': true,
    'kettlebell': true,
    'barbell': true,
    'machine': true,
    'cable': true
  };

  const equipmentAlias = {
    'body weight': 'bodyweight',
    'body-weight': 'bodyweight',
    'bw': 'bodyweight',
    'none': 'bodyweight',
    'dumbbell': 'dumbbells',
    'db': 'dumbbells',
    'haltères': 'dumbbells',
    'bands': 'band',
    'resistance band': 'band',
    'mini band': 'band',
    'loop band': 'band',
    'kb': 'kettlebell'
  };

  const fatigueAllowed = {'low': true, 'medium': true, 'high': true};

  const equipmentCounts = {};
  const fatigueCounts = {};

  const issues = {
    equipmentBlank: [],
    equipmentListLike: [],
    equipmentUnknown: [],
    equipmentAliasSuggested: [],
    equipmentNameMismatch: [],
    fatigueBlank: [],
    fatigueUnknown: [],
    fatigueOutOfRange: []
  };

  const maxIssues = Math.max(50, parseInt(limitIssues || 200, 10));

  function pushIssue(bucket, item) {
    if (issues[bucket].length < maxIssues) issues[bucket].push(item);
  }

  function inc(map, k) {
    map[k] = (map[k] || 0) + 1;
  }

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const id = idIdx !== -1 ? String(row[idIdx] || '').trim() : '';
    const name = nameIdx !== -1 ? String(row[nameIdx] || '').trim() : '';
    const nameN = norm(name);

    const equipRaw = String(row[equipIdx] || '').trim();
    const equipN = norm(equipRaw);
    inc(equipmentCounts, equipN || '(blank)');

    if (!equipN) {
      pushIssue('equipmentBlank', {row: r + 1, id: id, name: name});
    } else {
      if (equipRaw.indexOf(',') !== -1 || equipRaw.indexOf(';') !== -1 || equipRaw.indexOf('/') !== -1) {
        pushIssue('equipmentListLike', {row: r + 1, id: id, name: name, equipment: equipRaw});
      }
      const alias = equipmentAlias[equipN];
      if (alias && alias !== equipN) {
        pushIssue('equipmentAliasSuggested', {row: r + 1, id: id, name: name, equipment: equipRaw, suggest: alias});
      }
      const equipCanonical = alias || equipN;
      if (!allowedEquipment[equipCanonical]) {
        pushIssue('equipmentUnknown', {row: r + 1, id: id, name: name, equipment: equipRaw});
      }

      // Quick sanity mismatch: name implies dumbbells/band/trx but equipment doesn't
      const impliesDb = /\bdumbbell\b|\bdb\b|halt[eè]re/.test(nameN);
      const impliesBand = /band|resistance band|mini band|loop/.test(nameN);
      const impliesTrx = /\btrx\b|suspension/.test(nameN);
      if (impliesDb && equipCanonical !== 'dumbbells') {
        pushIssue('equipmentNameMismatch', {row: r + 1, id: id, name: name, equipment: equipRaw, implies: 'dumbbells'});
      } else if (impliesBand && equipCanonical !== 'band') {
        pushIssue('equipmentNameMismatch', {row: r + 1, id: id, name: name, equipment: equipRaw, implies: 'band'});
      } else if (impliesTrx && equipCanonical !== 'trx') {
        pushIssue('equipmentNameMismatch', {row: r + 1, id: id, name: name, equipment: equipRaw, implies: 'trx'});
      }
    }

    const fatRaw = String(row[fatigueIdx] || '').trim();
    const fatN = norm(fatRaw);
    inc(fatigueCounts, fatN || '(blank)');

    if (!fatN) {
      pushIssue('fatigueBlank', {row: r + 1, id: id, name: name});
      continue;
    }

    if (fatigueAllowed[fatN]) continue;
    // numeric allowed 1..10
    const asNum = parseFloat(fatN);
    if (!isNaN(asNum) && isFinite(asNum)) {
      if (asNum < 1 || asNum > 10) {
        pushIssue('fatigueOutOfRange', {row: r + 1, id: id, name: name, fatigue: fatRaw});
      }
      continue;
    }
    // allow key:value style (e.g., "quads:3") or multiple pairs
    if (fatRaw.indexOf(':') !== -1) continue;

    pushIssue('fatigueUnknown', {row: r + 1, id: id, name: name, fatigue: fatRaw});
  }

  // Sort counts to provide top domains
  function topN(map, n) {
    const arr = Object.keys(map).map(k => [k, map[k]]);
    arr.sort((a, b) => b[1] - a[1]);
    return arr.slice(0, n || 30);
  }

  return {
    status: 'ok',
    rows: lastRow - 1,
    equipment: {
      distinct: Object.keys(equipmentCounts).length,
      top: topN(equipmentCounts, 30),
      unknownCount: issues.equipmentUnknown.length,
      blankCount: issues.equipmentBlank.length,
      listLikeCount: issues.equipmentListLike.length,
      aliasSuggestedCount: issues.equipmentAliasSuggested.length,
      nameMismatchCount: issues.equipmentNameMismatch.length
    },
    fatigue: {
      distinct: Object.keys(fatigueCounts).length,
      top: topN(fatigueCounts, 30),
      blankCount: issues.fatigueBlank.length,
      unknownCount: issues.fatigueUnknown.length,
      outOfRangeCount: issues.fatigueOutOfRange.length
    },
    issues: issues
  };
}

function auditExerciceDBEquipmentFatigueWrapper() { return auditExerciceDBEquipmentFatigue(); }

function getFatigueKeyAliasMap_() {
  // Only include high-confidence, non-destructive normalizations.
  return {
    'shoulder': 'shoulders',
    'upperback': 'upper back',
    'lowerback': 'lower back',
    'midback': 'mid back',
    'hipflexors': 'hip flexors',
    'innerthighs': 'inner thighs',
    'outerthighs': 'outer thighs',
    'posteriorchain': 'posterior chain',
    'ankles': 'calves',
    'hip': 'hips',
    'quad': 'quads',
    'hamstring': 'hamstrings',
    'glute': 'glutes',
    'calf': 'calves',
    'tricep': 'triceps',
    'bicep': 'biceps',
    'oblique': 'obliques',
    'ab': 'abs',
    'upperback': 'upper back'
  };
}

// Force-remap Ankles -> Calves in ExerciceDB (primary_muscle and Fatigue keys).
// Creates a backup tab for rollback and tags Modified_Auto for traceability.
function fixExerciceDBAnklesToCalves() {
  const ss = getSpreadsheetForHelpers_();
  const sh = ss.getSheetByName('ExerciceDB');
  if (!sh) return {error: 'ExerciceDB missing'};

  const backup = backupSheetIfMissing_(ss, 'ExerciceDB');

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2) return {status: 'no_rows', backup: backup};

  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
  const lower = headers.map(h => String(h || '').toLowerCase());
  const primaryIdx = lower.indexOf('primary_muscle');
  const fatigueIdx = lower.indexOf('fatigue');

  // Ensure Modified_Auto exists
  let modIdx = lower.indexOf('modified_auto');
  if (modIdx === -1) {
    sh.insertColumnAfter(sh.getLastColumn());
    sh.getRange(1, sh.getLastColumn()).setValue('Modified_Auto');
    modIdx = sh.getLastColumn() - 1;
  }

  const data = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
  const tag = 'ANKLES_TO_CALVES_' + Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone() || 'Etc/UTC', 'yyyy-MM-dd');
  const fatigueAlias = getFatigueKeyAliasMap_();

  function normalize(k) {
    return String(k || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }
  function titleCase(s) {
    const n = String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
    return n.split(' ').map(w => w ? (w.charAt(0).toUpperCase() + w.slice(1)) : '').join(' ').trim();
  }

  const updates = {primary: [], fatigue: []};

  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    let touched = false;

    if (primaryIdx !== -1) {
      const pmRaw = String(row[primaryIdx] || '').trim();
      if (normalize(pmRaw) === 'ankles') {
        row[primaryIdx] = 'Calves';
        updates.primary.push({row: r + 2, from: pmRaw, to: 'Calves'});
        touched = true;
      }
    }

    if (fatigueIdx !== -1) {
      const fatRaw = String(row[fatigueIdx] || '').trim();
      if (fatRaw && fatRaw.indexOf(':') !== -1) {
        const pairs = parseFatiguePairs_(fatRaw);
        if (pairs.length > 0) {
          // Canonicalize keys (including Ankles->Calves) and merge duplicates deterministically.
          const order = [];
          const seen = {};
          const best = {}; // key -> {num, raw}
          let changed = false;

          for (const [k, v] of pairs) {
            const kn = normalize(k);
            const mapped = fatigueAlias[kn] || kn;
            const canonicalKey = titleCase(mapped);
            const rawVal = String(v || '').trim();
            const num = parseFloat(rawVal);

            if (!seen[canonicalKey]) {
              seen[canonicalKey] = true;
              order.push(canonicalKey);
              best[canonicalKey] = { num: isNaN(num) ? null : num, raw: rawVal };
            } else {
              changed = true; // duplicate key merged
              const cur = best[canonicalKey];
              if (cur && cur.num != null && !isNaN(num)) {
                if (num > cur.num) best[canonicalKey] = { num: num, raw: rawVal };
              } else if (cur && cur.num == null && !isNaN(num)) {
                best[canonicalKey] = { num: num, raw: rawVal };
              }
            }

            if (canonicalKey !== String(k || '').trim()) changed = true;
          }

          const newPairs = order.map(key => [key, (best[key] ? best[key].raw : '')]);
          const newFat = formatFatiguePairs_(newPairs);

          if (newFat && newFat !== fatRaw) {
            row[fatigueIdx] = newFat;
            updates.fatigue.push({row: r + 2, from: fatRaw, to: newFat});
            touched = true;
          }
        }
      }
    }

    if (touched) {
      const existing = String(row[modIdx] || '').trim();
      if (!existing) row[modIdx] = tag;
      else if (existing.indexOf(tag) === -1) row[modIdx] = existing + ';' + tag;
    }
  }

  const changedCount = updates.primary.length + updates.fatigue.length;
  if (changedCount === 0) return {status: 'ok', changed: 0, backup: backup};

  sh.getRange(2, 1, data.length, sh.getLastColumn()).setValues(data);
  SpreadsheetApp.flush();
  return {status: 'ok', changed: changedCount, updates: {primary: updates.primary.slice(0, 50), fatigue: updates.fatigue.slice(0, 50)}, backup: backup};
}

function fixExerciceDBAnklesToCalvesWrapper() { return fixExerciceDBAnklesToCalves(); }

function fixExerciceDBPrimaryMuscleKeys() {
  const ss = getSpreadsheetForHelpers_();
  const sh = ss.getSheetByName('ExerciceDB');
  if (!sh) return {error: 'ExerciceDB missing'};

  const backup = backupSheetIfMissing_(ss, 'ExerciceDB');

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2) return {status: 'no_rows', backup: backup};

  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
  const lower = headers.map(h => String(h || '').toLowerCase());
  const primaryIdx = lower.indexOf('primary_muscle');
  if (primaryIdx === -1) return {error: 'primary_muscle column missing', headers: headers, backup: backup};

  // Ensure Modified_Auto exists
  let modIdx = lower.indexOf('modified_auto');
  if (modIdx === -1) {
    sh.insertColumnAfter(sh.getLastColumn());
    sh.getRange(1, sh.getLastColumn()).setValue('Modified_Auto');
    modIdx = sh.getLastColumn() - 1;
  }

  const data = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
  const alias = getFatigueKeyAliasMap_();
  const tag = 'PRIMARY_MUSCLE_FIX_' + Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone() || 'Etc/UTC', 'yyyy-MM-dd');

  const updates = [];

  function normalizeKey(k) {
    return String(k || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    const raw = String(row[primaryIdx] || '').trim();
    if (!raw) continue;
    const norm = normalizeKey(raw);
    const mapped = alias[norm];
    if (!mapped) continue;

    // Preserve casing style: Title Case with spaces
    const canonical = mapped.split(' ').map(w => w ? (w.charAt(0).toUpperCase() + w.slice(1)) : '').join(' ').trim();
    if (!canonical || canonical === raw) continue;

    row[primaryIdx] = canonical;

    const existing = String(row[modIdx] || '').trim();
    if (!existing) row[modIdx] = tag;
    else if (existing.indexOf(tag) === -1) row[modIdx] = existing + ';' + tag;

    updates.push({row: r + 2, from: raw, to: canonical});
  }

  if (updates.length === 0) return {status: 'ok', changed: 0, backup: backup};

  sh.getRange(2, 1, data.length, sh.getLastColumn()).setValues(data);
  SpreadsheetApp.flush();
  return {status: 'ok', changed: updates.length, updates: updates.slice(0, 50), backup: backup};
}

function fixExerciceDBPrimaryMuscleKeysWrapper() { return fixExerciceDBPrimaryMuscleKeys(); }

function normalizeFatigueKey_(k) {
  return String(k || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Parse a Fatigue string like "core:0.7;shoulders:0.4" into ordered pairs.
function parseFatiguePairs_(fatigueRaw) {
  const raw = String(fatigueRaw || '').trim();
  if (!raw) return [];
  // Allow freeform non-pairs by returning empty.
  if (raw.indexOf(':') === -1) return [];

  const parts = raw.split(';').map(p => String(p || '').trim()).filter(Boolean);
  const pairs = [];
  for (const part of parts) {
    const idx = part.indexOf(':');
    if (idx === -1) return [];
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!key || !val) return [];
    pairs.push([key, val]);
  }
  return pairs;
}

function formatFatiguePairs_(pairs) {
  return pairs.map(([k, v]) => String(k).trim() + ':' + String(v).trim()).join(';');
}

// Read-only audit for Fatigue keys: finds keys that match the alias map and reports suggested replacements.
function auditExerciceDBFatigueKeys(limitIssues) {
  const ss = getSpreadsheetForHelpers_();
  const sh = ss.getSheetByName('ExerciceDB');
  if (!sh) return {error: 'ExerciceDB missing'};

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2) return {status: 'no_rows'};

  const values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = values[0].map(h => String(h || '').trim());
  const lower = headers.map(h => String(h || '').toLowerCase());
  const idIdx = lower.indexOf('id');
  const nameIdx = (lower.indexOf('name') !== -1) ? lower.indexOf('name') : (lower.indexOf('nom complet') !== -1 ? lower.indexOf('nom complet') : -1);
  const fatigueIdx = lower.indexOf('fatigue');
  if (fatigueIdx === -1) return {error: 'Fatigue column missing', headers: headers};

  const alias = getFatigueKeyAliasMap_();
  const maxIssues = Math.max(50, parseInt(limitIssues || 200, 10));

  const keyCounts = {};
  const aliasHits = {};
  const issues = [];
  let rowsNeedingFix = 0;

  function inc(map, k) { map[k] = (map[k] || 0) + 1; }

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const id = idIdx !== -1 ? String(row[idIdx] || '').trim() : '';
    const name = nameIdx !== -1 ? String(row[nameIdx] || '').trim() : '';
    const fatRaw = String(row[fatigueIdx] || '').trim();
    if (!fatRaw) continue;
    const pairs = parseFatiguePairs_(fatRaw);
    if (pairs.length === 0) continue;

    let changed = false;
    const proposed = [];
    for (const [k, v] of pairs) {
      const kn = normalizeFatigueKey_(k);
      inc(keyCounts, kn);
      if (alias[kn]) {
        inc(aliasHits, kn + '->' + alias[kn]);
        proposed.push({from: k, to: alias[kn], value: v});
        changed = true;
      }
    }

    if (changed) {
      rowsNeedingFix++;
      if (issues.length < maxIssues) {
        issues.push({row: r + 1, id: id, name: name, fatigue: fatRaw, proposed: proposed});
      }
    }
  }

  function topN(map, n) {
    const arr = Object.keys(map).map(k => [k, map[k]]);
    arr.sort((a, b) => b[1] - a[1]);
    return arr.slice(0, n || 30);
  }

  return {
    status: 'ok',
    rows: lastRow - 1,
    distinctKeys: Object.keys(keyCounts).length,
    topKeys: topN(keyCounts, 30),
    aliasTop: topN(aliasHits, 30),
    rowsNeedingFix: rowsNeedingFix,
    issues: issues
  };
}

// Applies ONLY alias-map fatigue key replacements. Creates ExerciceDB backup tab.
function fixExerciceDBFatigueKeys() {
  const ss = getSpreadsheetForHelpers_();
  const sh = ss.getSheetByName('ExerciceDB');
  if (!sh) return {error: 'ExerciceDB missing'};

  const backup = backupSheetIfMissing_(ss, 'ExerciceDB');

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2) return {status: 'no_rows', backup: backup};

  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
  const lower = headers.map(h => String(h || '').toLowerCase());
  const fatigueIdx = lower.indexOf('fatigue');
  if (fatigueIdx === -1) return {error: 'Fatigue column missing', headers: headers, backup: backup};

  // Ensure Modified_Auto exists
  let modIdx = lower.indexOf('modified_auto');
  if (modIdx === -1) {
    sh.insertColumnAfter(sh.getLastColumn());
    sh.getRange(1, sh.getLastColumn()).setValue('Modified_Auto');
    modIdx = sh.getLastColumn() - 1;
  }

  const data = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
  const alias = getFatigueKeyAliasMap_();
  const tag = 'FATIGUE_KEYFIX_' + Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone() || 'Etc/UTC', 'yyyy-MM-dd');

  const updates = [];
  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    const fatRaw = String(row[fatigueIdx] || '').trim();
    if (!fatRaw) continue;
    const pairs = parseFatiguePairs_(fatRaw);
    if (pairs.length === 0) continue;

    let changed = false;
    const newPairs = [];
    for (const [k, v] of pairs) {
      const kn = normalizeFatigueKey_(k);
      if (alias[kn]) {
        newPairs.push([alias[kn], v]);
        changed = true;
      } else {
        newPairs.push([k, v]);
      }
    }

    if (!changed) continue;
    const newFatigue = formatFatiguePairs_(newPairs);
    if (newFatigue === fatRaw) continue;

    row[fatigueIdx] = newFatigue;

    const existing = String(row[modIdx] || '').trim();
    if (!existing) row[modIdx] = tag;
    else if (existing.indexOf(tag) === -1) row[modIdx] = existing + ';' + tag;

    updates.push({row: r + 2, from: fatRaw, to: newFatigue});
  }

  if (updates.length === 0) return {status: 'ok', changed: 0, backup: backup};

  sh.getRange(2, 1, data.length, sh.getLastColumn()).setValues(data);
  SpreadsheetApp.flush();
  return {status: 'ok', changed: updates.length, updates: updates.slice(0, 50), backup: backup};
}

function auditExerciceDBFatigueKeysWrapper() { return auditExerciceDBFatigueKeys(); }
function fixExerciceDBFatigueKeysWrapper() { return fixExerciceDBFatigueKeys(); }

// Auto-fix ExerciceDB issues:
// - Fill placeholder/blank names with 'TODO: name' and mark Modified
// - Add missing Exercise IDs referenced from Sets as new rows with placeholder names
// - Normalize / infer `equipment`, `body_category`, and `fatigue` and tag changes with Modified_Auto
function autoFixExerciceDB() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('ExerciceDB');
  if (!sh) return {error: 'ExerciceDB missing'};

  // Ensure ID column exists
  ensureExerciceDBKey();

  // Read headers and find key columns
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
  const lower = headers.map(h => String(h || '').toLowerCase());
  const idIdx = lower.indexOf('id') !== -1 ? lower.indexOf('id') : 0;
  const nameIdx = lower.indexOf('nom complet') !== -1 ? lower.indexOf('nom complet') : (lower.indexOf('name') !== -1 ? lower.indexOf('name') : 1);
  const equipIdx = lower.indexOf('equipment') !== -1 ? lower.indexOf('equipment') : (lower.indexOf('equip') !== -1 ? lower.indexOf('equip') : -1);
  const primaryIdx = lower.indexOf('primary_muscle') !== -1 ? lower.indexOf('primary_muscle') : (lower.indexOf('primary') !== -1 ? lower.indexOf('primary') : -1);
  const bodyIdx = lower.indexOf('body_category') !== -1 ? lower.indexOf('body_category') : (lower.indexOf('category') !== -1 ? lower.indexOf('category') : -1);
  const fatigueIdx = lower.indexOf('fatigue') !== -1 ? lower.indexOf('fatigue') : -1;

  // Ensure Modified_Auto column exists at the end
  let modIdx = lower.indexOf('modified_auto');
  if (modIdx === -1) {
    sh.insertColumnAfter(sh.getLastColumn());
    sh.getRange(1, sh.getLastColumn()).setValue('Modified_Auto');
    modIdx = sh.getLastColumn() - 1;
  }

  const lastCol = sh.getLastColumn();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return {status: 'no_rows'};

  const data = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const existingIds = data.map(r => String(r[idIdx] || '').trim());

  // Find missing IDs referenced by Sets
  const shSets = ss.getSheetByName('Sets');
  const missingIds = [];
  if (shSets) {
    const sdata = shSets.getDataRange().getValues();
    const sHeader = sdata[0].map(h => String(h || '').trim());
    const sExIdx = sHeader.indexOf('Exercise');
    if (sExIdx !== -1) {
      const referenced = {};
      for (let i = 1; i < sdata.length; i++) {
        const v = String(sdata[i][sExIdx] || '').trim();
        if (v) referenced[v] = (referenced[v] || 0) + 1;
      }
      Object.keys(referenced).forEach(k => {
        if (existingIds.indexOf(k) === -1) missingIds.push(k);
      });
    }
  }

  const changes = {fixedNames: [], addedRows: [], equipmentFixes: [], categoryFixes: [], fatigueFixes: []};
  const badNames = ['','name','nom','n/a','—','-'];
  const now = new Date().toISOString();

  // Helper: infer equipment from name
  function inferEquipment(name) {
    if (!name) return '';
    const n = name.toLowerCase();
    if (n.match(/dumbbell|db\b/)) return 'dumbbell';
    if (n.match(/kettlebell|kb\b/)) return 'kettlebell';
    if (n.match(/band|resistance band|mini band|loop/)) return 'band';
    if (n.match(/trx|suspension/)) return 'trx';
    if (n.match(/barbell|barbell/)) return 'barbell';
    if (n.match(/machine|leg press|cable/)) return 'machine';
    if (n.match(/rower|bike|treadmill/)) return 'machine';
    if (n.match(/bodyweight|plank|push[- ]?up|pull[- ]?up|sit[- ]?up|burpee/)) return 'bodyweight';
    if (n.match(/sandbag|medball|medicine ball/)) return 'sandbag';
    return '';
  }

  // Helper: infer body_category from primary or name
  function inferCategory(primary, name) {
    const p = (primary || '').toLowerCase();
    const n = (name || '').toLowerCase();
    if (p.indexOf('core') !== -1 || n.indexOf('plank') !== -1) return 'Core';
    if (p.indexOf('quad') !== -1 || p.indexOf('hamstring') !== -1 || p.indexOf('glute') !== -1 || n.match(/squat|lunge|deadlift/)) return 'Lower';
    if (p.indexOf('biceps') !== -1 || p.indexOf('triceps') !== -1 || p.indexOf('shoulder') !== -1 || p.indexOf('pec') !== -1 || n.match(/row|press|pull|chin/)) return 'Upper';
    if (n.match(/carry|clean|snatch|thruster|burpee/)) return 'Full Body';
    if (n.match(/stretch|mobility|yoga|pilates/)) return 'Mobility';
    return '';
  }

  // Helper: normalize fatigue to Low/Medium/High
  function normalizeFatigue(f) {
    if (f === null || f === undefined) return 'Medium';
    const s = String(f).trim().toLowerCase();
    if (s === '') return 'Medium';
    if (s.match(/^[0-9]+$/)) {
      const v = parseInt(s, 10);
      if (v <= 3) return 'Low';
      if (v <= 7) return 'Medium';
      return 'High';
    }
    if (s.indexOf('low') !== -1 || s === 'l') return 'Low';
    if (s.indexOf('med') !== -1 || s === 'm') return 'Medium';
    if (s.indexOf('high') !== -1 || s === 'h') return 'High';
    // default
    return 'Medium';
  }

  // Fix blank or placeholder names
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const name = String(row[nameIdx] || '').trim();
    if (badNames.indexOf(name.toLowerCase()) !== -1) {
      const newName = 'TODO: name';
      sh.getRange(i + 2, nameIdx + 1).setValue(newName);
      sh.getRange(i + 2, modIdx + 1).setValue('name_filled_' + now);
      changes.fixedNames.push({row: i + 2, old: name, new: newName});
    }

    // Equipment inference and fix
    if (equipIdx !== -1) {
      const existing = String(row[equipIdx] || '').trim();
      const suggested = inferEquipment(name || String(row[nameIdx] || '').trim());
      if (suggested && suggested !== '' && suggested !== existing.toLowerCase()) {
        sh.getRange(i + 2, equipIdx + 1).setValue(suggested);
        sh.getRange(i + 2, modIdx + 1).setValue((String(sh.getRange(i + 2, modIdx + 1).getValue()) || '') + '|equip_' + now);
        changes.equipmentFixes.push({row: i + 2, id: String(row[idIdx] || ''), old: existing, new: suggested});
      }
    }

    // Body category inference and fix
    if (bodyIdx !== -1) {
      const existing = String(row[bodyIdx] || '').trim();
      const suggested = inferCategory(String(row[primaryIdx] || '').trim(), name);
      if (suggested && suggested !== '' && suggested.toLowerCase() !== existing.toLowerCase()) {
        sh.getRange(i + 2, bodyIdx + 1).setValue(suggested);
        sh.getRange(i + 2, modIdx + 1).setValue((String(sh.getRange(i + 2, modIdx + 1).getValue()) || '') + '|category_' + now);
        changes.categoryFixes.push({row: i + 2, id: String(row[idIdx] || ''), old: existing, new: suggested});
      }
    }

    // Fatigue normalization and fix
    if (fatigueIdx !== -1) {
      const existing = String(row[fatigueIdx] || '').trim();
      const suggested = normalizeFatigue(existing);
      if (suggested !== existing) {
        sh.getRange(i + 2, fatigueIdx + 1).setValue(suggested);
        sh.getRange(i + 2, modIdx + 1).setValue((String(sh.getRange(i + 2, modIdx + 1).getValue()) || '') + '|fatigue_' + now);
        changes.fatigueFixes.push({row: i + 2, id: String(row[idIdx] || ''), old: existing, new: suggested});
      }
    }
  }

  // Append missing IDs as placeholder rows
  for (let id of missingIds) {
    const newRow = [];
    for (let c = 0; c < lastCol; c++) newRow.push('');
    newRow[idIdx] = id;
    newRow[nameIdx] = 'TODO: auto-added ' + id;
    newRow[modIdx] = 'added_' + now;
    sh.appendRow(newRow);
    changes.addedRows.push({id: id, name: newRow[nameIdx]});
  }

  // Write a changelog sheet for audit if not present
  let logSh = ss.getSheetByName('ExerciceDB_Changelog');
  if (!logSh) logSh = ss.insertSheet('ExerciceDB_Changelog');
  const logHeader = ['timestamp','row','id','field','old','new','note'];
  if (logSh.getLastRow() === 0) logSh.appendRow(logHeader);
  function appendLog(items, field) {
    for (let it of items) {
      const rowNum = it.row || '';
      const id = it.id || '';
      const old = it.old || '';
      const ne = it.new || '';
      const note = field;
      logSh.appendRow([now, rowNum, id, field, old, ne, note]);
    }
  }
  appendLog(changes.fixedNames.map(f => ({row: f.row, id: '', old: f.old, new: f.new})), 'name');
  appendLog(changes.equipmentFixes, 'equipment');
  appendLog(changes.categoryFixes, 'body_category');
  appendLog(changes.fatigueFixes, 'fatigue');
  appendLog(changes.addedRows.map(a => ({row: '', id: a.id, old: '', new: a.name})), 'added_row');

  return changes;
}

function autoFixExerciceDBWrapper() { return autoFixExerciceDB(); }

function forceAssignTestUserSets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('Sets');
  if (!sh) return {error: 'sets missing'};
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h || '').trim());
  const idIdx = headers.indexOf('ID');
  const glideIdx = headers.indexOf('Glide_Wod_ID');
  const out = [];
  for (let i=1;i<data.length;i++) {
    const glide = String(data[i][glideIdx] || '');
    if (glide.indexOf('testuser@example.com_1') !== -1) {
      const res = forceAssignAnyExerciseToSet(String(data[i][idIdx]));
      out.push(res);
    }
  }
  return out;
}

// Add a doPost action hook to call replace via webhook
function handleReplaceFromPost(data) {
  if (!data || !data.setId) return {status: 'error', msg: 'missing setId'};
  return replaceExerciseForSet(data.setId);
}

// Ensure an Exercise column exists in Sets; if missing, insert it after Glide_Wod_ID (col 2)
function addExerciseColumnIfMissing() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('Sets');
  if (!sh) return {error: 'sets missing'};
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
  if (headers.indexOf('Exercise') !== -1) return {status: 'already'};
  const insertPos = 3; // after Glide_Wod_ID
  sh.insertColumnBefore(insertPos);
  sh.getRange(1, insertPos).setValue('Exercise');
  return {status: 'inserted', pos: insertPos};
}

function addExerciseColumnIfMissingWrapper() { return addExerciseColumnIfMissing(); }