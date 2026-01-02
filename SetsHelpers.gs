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

  const idIdx = dbHeader.indexOf('id') !== -1 ? dbHeader.indexOf('id') : dbHeader.indexOf('identifier') !== -1 ? dbHeader.indexOf('identifier') : -1;

  let candidates = [];
  for (let i=1;i<dbData.length;i++) {
    const r = dbData[i];
    const rName = String(r[nameIdx] || '').trim();
    const rId = idIdx !== -1 ? String(r[idIdx] || '').trim() : (rName || '');
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
      const rId = idIdx !== -1 ? String(r[idIdx] || '').trim() : (rName || '');
      const rEquip = equipDbIdx !== -1 ? String(r[equipDbIdx] || '').toLowerCase() : '';
      if ((rName || rId) && rEquip && equip && rEquip.includes(equip)) candidates.push({id: rId, name: rName});
    }
  }
  if (candidates.length === 0) {
    // Last resort: any non-empty exercise
    for (let i=1;i<dbData.length;i++) {
      const r = dbData[i];
      const rName = String(r[nameIdx] || '').trim();
      const rId = idIdx !== -1 ? String(r[idIdx] || '').trim() : (rName || '');
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
  const idIdx = headers.indexOf('id') !== -1 ? headers.indexOf('id') : headers.indexOf('ID') !== -1 ? headers.indexOf('ID') : -1;
  const nameIdx = headers.indexOf('nom complet') !== -1 ? headers.indexOf('nom complet') : headers.indexOf('name') !== -1 ? headers.indexOf('name') : 0;
  const equipIdx = headers.indexOf('equipment') !== -1 ? headers.indexOf('equipment') : headers.indexOf('equip');
  const primaryIdx = headers.indexOf('primary_muscle') !== -1 ? headers.indexOf('primary_muscle') : headers.indexOf('primary') !== -1 ? headers.indexOf('primary') : -1;
  const out = [];
  const lim = Math.min(limit || 50, data.length - 1);
  for (let i = 1; i <= lim; i++) {
    out.push({row: i+1, id: (idIdx !== -1 ? data[i][idIdx] : ''), name: data[i][nameIdx], equip: (equipIdx !== -1 ? data[i][equipIdx] : ''), primary: (primaryIdx !== -1 ? data[i][primaryIdx] : '')});
  }
  return out;
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
  const idIdx = headers.map(h=>h.toLowerCase()).indexOf('id');
  if (idIdx !== -1) return {status: 'already', idCol: idIdx+1};
  // insert ID as first column and populate sequential numeric keys
  sh.insertColumnBefore(1);
  sh.getRange(1,1).setValue('ID');
  const rows = sh.getLastRow();
  const values = [];
  for (let r=2; r<=rows; r++) { values.push([r-1]); }
  if (values.length > 0) sh.getRange(2,1,values.length,1).setValues(values);
  return {status: 'inserted', rows: values.length};
}

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