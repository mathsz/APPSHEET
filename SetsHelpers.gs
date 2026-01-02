/* Helpers for managing Sets sheet: ensure schema, validations, auto-assign exercises, replace exercise */

function ensureSetsSchema() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('Sets');
  if (!sh) {
    sh = ss.insertSheet('Sets');
    sh.appendRow(['ID', 'Glide_Wod_ID', 'Exercise', 'SetNumber', 'Reps', 'Load', 'Notes']);
    return {created: true, headers: sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0]};
  }
  // ensure headers
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
  const desired = ['ID', 'Glide_Wod_ID', 'Exercise', 'SetNumber', 'Reps', 'Load', 'Notes'];
  let updated = false;
  desired.forEach((h, i) => {
    if (headers[i] !== h) {
      // if the header exists elsewhere, move it; else insert
      const found = headers.indexOf(h);
      if (found !== -1) {
        // swap columns
        sh.insertColumnBefore(i+1);
        sh.getRange(1, found+1, sh.getMaxRows(), 1).moveTo(sh.getRange(1, i+1));
        sh.deleteColumn(found+2);
        updated = true;
      } else {
        // insert new column at position
        sh.insertColumnBefore(i+1);
        sh.getRange(1, i+1).setValue(h);
        updated = true;
      }
    }
  });
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
  if (!row) return null;
  const equip = equipIdx !== -1 ? String(row[equipIdx] || '').toLowerCase() : '';
  const mus = musIdx !== -1 ? String(row[musIdx] || '').toLowerCase() : '';

  // search db for matching exercises
  const dbData = db.getDataRange().getValues();
  const dbHeader = dbData[0].map(h => String(h || '').toLowerCase());
  const nameIdx = dbHeader.indexOf('nom complet') !== -1 ? dbHeader.indexOf('nom complet') : 0;
  const equipDbIdx = dbHeader.indexOf('equipment') !== -1 ? dbHeader.indexOf('equipment') : dbHeader.indexOf('equip');
  const primaryIdx = dbHeader.indexOf('primary_muscle') !== -1 ? dbHeader.indexOf('primary_muscle') : dbHeader.indexOf('primary') !== -1 ? dbHeader.indexOf('primary') : -1;

  let candidates = [];
  for (let i=1;i<dbData.length;i++) {
    const r = dbData[i];
    const rName = String(r[nameIdx] || '').trim();
    const rEquip = equipDbIdx !== -1 ? String(r[equipDbIdx] || '').toLowerCase() : '';
    const rPrimary = primaryIdx !== -1 ? String(r[primaryIdx] || '').toLowerCase() : '';

    let matchEquip = false;
    if (!equip || equip === '' || rEquip === '') matchEquip = true; else if (rEquip.toLowerCase().includes(equip)) matchEquip = true;
    let matchMus = false;
    if (!mus || mus === '') matchMus = true; else if (rPrimary.toLowerCase().includes(mus) || rName.toLowerCase().includes(mus)) matchMus = true;

    if (matchEquip && matchMus && rName) candidates.push(rName);
  }
  if (candidates.length === 0) {
    // Try looser matching: equipment only
    for (let i=1;i<dbData.length;i++) {
      const r = dbData[i];
      const rName = String(r[nameIdx] || '').trim();
      const rEquip = equipDbIdx !== -1 ? String(r[equipDbIdx] || '').toLowerCase() : '';
      if (rName && rEquip && equip && rEquip.includes(equip)) candidates.push(rName);
    }
  }
  if (candidates.length === 0) {
    // Last resort: any non-empty exercise
    for (let i=1;i<dbData.length;i++) {
      const r = dbData[i];
      const rName = String(r[nameIdx] || '').trim();
      if (rName) candidates.push(rName);
    }
  }
  if (candidates.length === 0) return null;
  // pick a random one
  return candidates[Math.floor(Math.random()*candidates.length)];
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
  const updates = [];
  for (let i=1;i<data.length;i++) {
    const row = data[i];
    if ((!row[exIdx] || String(row[exIdx]).trim() === '') && row[glideIdx]) {
      const candidate = findExerciseForGlideId(String(row[glideIdx]));
      if (candidate) {
        sh.getRange(i+1, exIdx+1).setValue(candidate);
        updates.push({row: i+1, exercise: candidate});
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
        return {row: i+1, exercise: candidate};
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
    out.push({row: i+1, id: data[i][idIdx], glide: data[i][glideIdx], exercise: data[i][exIdx]});
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
  return {id: row[idIdx], equipment: (equipIdx !== -1 ? row[equipIdx] : ''), muscles: (musIdx !== -1 ? row[musIdx] : '')};
}

function dumpExerciceDB(limit) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('ExerciceDB');
  if (!sh) return {error: 'ExerciceDB missing'};
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h || '').trim());
  const nameIdx = headers.indexOf('nom complet') !== -1 ? headers.indexOf('nom complet') : headers.indexOf('name') !== -1 ? headers.indexOf('name') : 0;
  const equipIdx = headers.indexOf('equipment') !== -1 ? headers.indexOf('equipment') : headers.indexOf('equip');
  const primaryIdx = headers.indexOf('primary_muscle') !== -1 ? headers.indexOf('primary_muscle') : headers.indexOf('primary') !== -1 ? headers.indexOf('primary') : -1;
  const out = [];
  const lim = Math.min(limit || 50, data.length - 1);
  for (let i = 1; i <= lim; i++) {
    out.push({row: i+1, name: data[i][nameIdx], equip: (equipIdx !== -1 ? data[i][equipIdx] : ''), primary: (primaryIdx !== -1 ? data[i][primaryIdx] : '')});
  }
  return out;
}

// Add a doPost action hook to call replace via webhook
function handleReplaceFromPost(data) {
  if (!data || !data.setId) return {status: 'error', msg: 'missing setId'};
  return replaceExerciseForSet(data.setId);
}