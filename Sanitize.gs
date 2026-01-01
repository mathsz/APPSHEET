function auditSampleRows() {
  const ss = (typeof getSs === 'function') ? getSs() : SpreadsheetApp.getActive();
  const sheetsToCheck = [SHEET_GLIDE, SHEET_HIST, SHEET_GEN, SHEET_DB, SHEET_DASH, 'Ref_Emails'];
  const emailRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
  const nameRegex = /mathieu|valo|verojanelle|maude|test|demo/i;
  const results = {};

  sheetsToCheck.forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh) return;
    const data = sh.getDataRange().getValues();
    if (!data || data.length < 2) return;
    const rows = [];
    for (let r = 1; r < data.length; r++) {
      const row = data[r];
      const joined = row.map(c => c === undefined || c === null ? '' : String(c)).join(' | ');
      if (emailRegex.test(joined) || nameRegex.test(joined)) {
        rows.push({rowNumber: r + 1, sample: joined});
      }
    }
    if (rows.length) results[name] = rows;
  });

  // Write results to Sanitize_Audit sheet
  let out = ss.getSheetByName('Sanitize_Audit');
  if (!out) out = ss.insertSheet('Sanitize_Audit');
  out.clear();
  const outRows = [['Sheet','Row','Sample']];
  Object.keys(results).forEach(sn => {
    results[sn].forEach(r => outRows.push([sn, r.rowNumber, r.sample]));
  });
  if (outRows.length > 1) out.getRange(1,1,outRows.length,outRows[0].length).setValues(outRows);

  return results;
}

/**
 * Move audited rows from a sheet to SeedData_<sheetName> after backing up.
 * This operation is destructive to the original sheet (rows removed) so it
 * should be run only after you inspect the audit and confirm.
 */
function moveSampleRows(sheetName) {
  const ss = (typeof getSs === 'function') ? getSs() : SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error('Sheet not found: ' + sheetName);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return {moved:0};

  // find rows matching audit regex
  const emailRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
  const nameRegex = /mathieu|valo|verojanelle|maude|test|demo/i;
  const header = data[0];
  const toMove = [];
  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    const joined = row.map(c => c === undefined || c === null ? '' : String(c)).join(' | ');
    if (emailRegex.test(joined) || nameRegex.test(joined)) toMove.push({rIndex: r+1, row: row});
  }

  if (toMove.length === 0) return {moved:0};

  // Backup sheet
  const ts = new Date().toISOString().replace(/[:.]/g,'-');
  const backupName = sheetName + '_Backup_' + ts;
  const backup = ss.insertSheet(backupName);
  backup.getRange(1,1,data.length,data[0].length).setValues(data);

  // SeedData sheet
  const seedName = 'SeedData_' + sheetName;
  let seed = ss.getSheetByName(seedName);
  if (!seed) seed = ss.insertSheet(seedName);
  const existingSeedRows = seed.getLastRow();
  if (existingSeedRows === 0) seed.appendRow(header);

  // Move rows from bottom to top to preserve indexes
  for (let i = toMove.length - 1; i >= 0; i--) {
    const item = toMove[i];
    const rowVals = sh.getRange(item.rIndex, 1, 1, header.length).getValues()[0];
    seed.appendRow(rowVals);
    sh.deleteRow(item.rIndex);
  }

  return {moved: toMove.length, backupSheet: backupName, seedSheet: seedName};
}

/**
 * Create `Sets` sheet with headers if missing.
 * Columns: ID | Glide_Wod_ID | SetNumber | Reps | Load | Notes
 */
function createSetsSheet() {
  const ss = (typeof getSs === 'function') ? getSs() : SpreadsheetApp.getActive();
  const name = 'Sets';
  const existing = ss.getSheetByName(name);
  if (existing) return {sheet: name, created: false};
  const sh = ss.insertSheet(name);
  const header = ['ID','Glide_Wod_ID','SetNumber','Reps','Load','Notes'];
  sh.getRange(1,1,1,header.length).setValues([header]);
  sh.setFrozenRows(1);
  return {sheet: name, created: true};
}

/**
 * Append a set row to `Sets`. Generates a simple unique ID if none provided.
 */
function addTestSet(glideId, setNumber, reps, load, notes) {
  const ss = (typeof getSs === 'function') ? getSs() : SpreadsheetApp.getActive();
  const name = 'Sets';
  let sh = ss.getSheetByName(name);
  if (!sh) createSetsSheet();
  sh = ss.getSheetByName(name);
  const id = 's_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
  sh.appendRow([id, glideId || '', setNumber || 1, reps || '', load || '', notes || '']);
  return {id: id};
}