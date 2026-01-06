// FITBOOK - SCRIPT ULTIME (Version Validée - Fix Pilates Tags)

/* ===================== CONFIGURATION GLOBALE ===================== */
if (typeof SHEET_DB === 'undefined') var SHEET_DB = "ExerciceDB";
if (typeof SHEET_GEN === 'undefined') var SHEET_GEN = "UserProfile";
if (typeof SHEET_WOD === 'undefined') var SHEET_WOD = "Wod";
if (typeof SHEET_HIST === 'undefined') var SHEET_HIST = "History";
if (typeof SHEET_DASH === 'undefined') var SHEET_DASH = "📊 Recovery";
if (typeof SHEET_GLIDE === 'undefined') var SHEET_GLIDE = "Glide_Wod";
if (typeof SHEET_HIIT === 'undefined') var SHEET_HIIT = "Glide_HIIT";

if (typeof RECIPES_START_ROW === 'undefined') var RECIPES_START_ROW = 36;
if (typeof RECIPES_ROWS === 'undefined') var RECIPES_ROWS = 100;

if (typeof DB_COL_NAME === 'undefined') var DB_COL_NAME = 0;
if (typeof DB_COL_ISO === 'undefined') var DB_COL_ISO = 3;
if (typeof DB_COL_EQUIP === 'undefined') var DB_COL_EQUIP = 6;
if (typeof DB_COL_CODE === 'undefined') var DB_COL_CODE = 7;
if (typeof DB_COL_FATIGUE === 'undefined') var DB_COL_FATIGUE = 23;

function ensureGlideWodSchema_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_GLIDE);
  const desired = [
    "ID", "Order", "Category", "Muscles", "Exercise", "Exercise_ID", "Equipment",
    "Reps_Text", "Weight_Sugg",
    "Set1_Reps", "Set1_Load", "Set2_Reps", "Set2_Load", "Set3_Reps", "Set3_Load",
    "Video_URL", "DoReplace", "Is_Done", "UserEmail"
  ];

  if (!sh) {
    sh = ss.insertSheet(SHEET_GLIDE);
    sh.appendRow(desired);
    return {created: true, headers: desired};
  }

  const lastCol = sh.getLastColumn();
  const headers = sh.getRange(1, 1, 1, Math.max(1, lastCol)).getValues()[0].map(h => String(h || '').trim());
  const lower = headers.map(h => h.toLowerCase());
  const existing = {};
  headers.forEach(h => { if (h) existing[h] = true; });

  let updated = false;

  // Ensure DoReplace exists and is positioned BEFORE Is_Done.
  const doReplaceIdx = lower.indexOf('doreplace');
  const isDoneIdx = lower.indexOf('is_done');
  if (doReplaceIdx === -1) {
    if (isDoneIdx !== -1) {
      // Insert DoReplace right before Is_Done
      sh.insertColumnBefore(isDoneIdx + 1);
      sh.getRange(1, isDoneIdx + 1).setValue('DoReplace');
      updated = true;
    }
  } else if (isDoneIdx !== -1 && doReplaceIdx > isDoneIdx) {
    // Move DoReplace before Is_Done (non-destructive move preserving values)
    const lastRow = sh.getLastRow();
    const colCount = sh.getLastColumn();

    const oldCol1Based = doReplaceIdx + 1;
    const insertBefore1Based = isDoneIdx + 1;
    // Read old values (excluding header)
    const oldVals = lastRow > 1 ? sh.getRange(2, oldCol1Based, lastRow - 1, 1).getValues() : [];

    sh.insertColumnBefore(insertBefore1Based);
    sh.getRange(1, insertBefore1Based).setValue('DoReplace');
    if (oldVals.length > 0) {
      sh.getRange(2, insertBefore1Based, oldVals.length, 1).setValues(oldVals);
    }

    // After insertion, the original DoReplace column shifted right by 1 if it was at/after insertion point.
    const shiftedOldCol1Based = oldCol1Based >= insertBefore1Based ? (oldCol1Based + 1) : oldCol1Based;
    // Safety: avoid deleting the newly inserted column.
    if (shiftedOldCol1Based !== insertBefore1Based) {
      sh.deleteColumn(shiftedOldCol1Based);
    }
    updated = true;
  }

  // Refresh headers after any structural changes above.
  const lastCol2 = sh.getLastColumn();
  const headers2 = sh.getRange(1, 1, 1, Math.max(1, lastCol2)).getValues()[0].map(h => String(h || '').trim());
  const existing2 = {};
  headers2.forEach(h => { if (h) existing2[h] = true; });

  desired.forEach((h) => {
    if (!existing2[h]) {
      sh.insertColumnAfter(sh.getLastColumn());
      sh.getRange(1, sh.getLastColumn()).setValue(h);
      updated = true;
    }
  });

  return {created: false, updated: updated};
}

function ensureGlideHiitSchema_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_HIIT);
  const desired = [
    'ID', 'Order', 'Round', 'Slot_In_Round',
    'Exercise', 'Exercise_ID', 'Primary_Muscle', 'Equipment',
    'Work_s', 'Rest_s', 'Interval_Label',
    'Video_URL', 'Is_Done', 'UserEmail', 'CreatedAt'
  ];

  if (!sh) {
    sh = ss.insertSheet(SHEET_HIIT);
    sh.appendRow(desired);
    return {created: true, headers: desired};
  }

  // If the sheet exists but has been cleared (no headers), rebuild the header row safely.
  const lc0 = sh.getLastColumn();
  const lr0 = sh.getLastRow();
  if (lc0 < 1 || lr0 < 1) {
    if (sh.getMaxColumns() < desired.length) {
      sh.insertColumnsAfter(sh.getMaxColumns(), desired.length - sh.getMaxColumns());
    }
    if (sh.getMaxRows() < 1) {
      sh.insertRowsAfter(1, 1 - sh.getMaxRows());
    }
    sh.getRange(1, 1, 1, desired.length).setValues([desired]);
    return {created: false, rebuilt: true, headers: desired};
  }

  const lastCol = lc0;
  const headers = sh.getRange(1, 1, 1, Math.max(1, lastCol)).getValues()[0].map(h => String(h || '').trim());
  const existing = new Set(headers.filter(Boolean));

  let updated = false;
  desired.forEach((h) => {
    if (!existing.has(h)) {
      sh.insertColumnAfter(sh.getLastColumn());
      sh.getRange(1, sh.getLastColumn()).setValue(h);
      updated = true;
    }
  });

  return {created: false, updated: updated};
}

function backupSheet_(ss, sheetName, prefix) {
  const sh = ss.getSheetByName(sheetName);
  if (!sh) return {status: 'error', msg: 'missing sheet'};
  const tz = ss.getSpreadsheetTimeZone() || 'Etc/UTC';
  const stamp = Utilities.formatDate(new Date(), tz, 'yyyyMMdd_HHmmss');
  const backupName = (prefix || sheetName) + '_backup_' + stamp;
  const copy = sh.copyTo(ss);
  copy.setName(backupName);
  return {status: 'ok', backupName: backupName};
}

function rebuildGlideWodSchema_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_GLIDE);
  if (!sh) return {status: 'error', msg: 'Glide_Wod missing'};

  const desired = [
    "ID", "Order", "Category", "Muscles", "Exercise", "Exercise_ID", "Equipment",
    "Reps_Text", "Weight_Sugg",
    "Set1_Reps", "Set1_Load", "Set2_Reps", "Set2_Load", "Set3_Reps", "Set3_Load",
    "Video_URL", "DoReplace", "Is_Done", "UserEmail"
  ];

  const backup = backupSheet_(ss, SHEET_GLIDE, SHEET_GLIDE);

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 1) {
    sh.clear();
    sh.getRange(1, 1, 1, desired.length).setValues([desired]);
    return {status: 'ok', backup: backup, rebuilt: true, rows: 0};
  }

  const data = sh.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = data[0].map(h => String(h || '').trim());
  const lower = headers.map(h => h.toLowerCase());
  const idx = (name) => lower.indexOf(String(name || '').toLowerCase());

  // Allow a few synonyms just in case.
  const synonym = {
    'exercise_id': ['Exercise_ID', 'Exercise Id', 'Exercice_ID', 'Exo_ID', 'Id', 'ID'],
    'useremail': ['UserEmail', 'User Email', 'Email', 'Mail'],
    'is_done': ['Is_Done', 'Done', 'IsDone', 'Done?'],
    'video_url': ['Video_URL', 'Video URL', 'URL', 'Url', 'Video']
  };
  function findIndexFor(col) {
    const direct = idx(col);
    if (direct !== -1) return direct;
    const key = String(col || '').toLowerCase();
    const alts = synonym[key];
    if (!alts) return -1;
    for (const a of alts) {
      const i = idx(a);
      if (i !== -1) return i;
    }
    return -1;
  }

  const remapped = [];
  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    const out = new Array(desired.length).fill('');
    for (let c = 0; c < desired.length; c++) {
      const colName = desired[c];
      const i = findIndexFor(colName);
      if (i !== -1 && i < row.length) out[c] = row[i];
    }
    // Keep completely empty rows out.
    if (out.some(v => v !== '' && v != null)) remapped.push(out);
  }

  // Rewrite sheet with correct headers and remapped rows.
  sh.clear();
  if (sh.getMaxColumns() < desired.length) {
    sh.insertColumnsAfter(sh.getMaxColumns(), desired.length - sh.getMaxColumns());
  }
  sh.getRange(1, 1, 1, desired.length).setValues([desired]);
  if (remapped.length > 0) {
    sh.getRange(2, 1, remapped.length, desired.length).setValues(remapped);
  }
  return {status: 'ok', backup: backup, rebuilt: true, rows: remapped.length, fromCols: lastCol, toCols: desired.length};
}

function getHistoryDataForUser_(ss, userEmail, limit) {
  const shHist = ss.getSheetByName(SHEET_HIST);
  if (!shHist || shHist.getLastRow() < 2) return [];
  const max = Math.max(50, parseInt(limit || 500, 10));
  const lastRow = shHist.getLastRow();
  const rows = Math.min(max, lastRow - 1);
  // History currently uses 11 columns in this project.
  const data = shHist.getRange(lastRow - rows + 1, 1, rows, 11).getValues();
  // Caller expects reverse chronological.
  return data.reverse();
}

function getExerciceDbRowById_(dbData, dbHeaders, exoId) {
  const idIdx = idxOf(dbHeaders, ["id"]);
  if (idIdx === -1) return null;
  const target = String(exoId || '').trim();
  if (!target) return null;
  for (let i = 0; i < dbData.length; i++) {
    if (String(dbData[i][idIdx] || '').trim() === target) return dbData[i];
  }
  return null;
}

function pickExerciseFromDb_(dbData, dbHeaders, opts) {
  const equipIdx = idxOf(dbHeaders, ["equipment", "equip"]);
  const primaryIdx = idxOf(dbHeaders, ["primary_muscle", "primary"]);
  if (equipIdx === -1) return null;

  const targetEquip = String((opts && opts.equipment) || '').trim().toLowerCase();
  const targetMuscle = String((opts && opts.muscle) || '').trim().toLowerCase();

  const candidates = [];
  for (let i = 0; i < dbData.length; i++) {
    const row = dbData[i];
    const eq = String(row[equipIdx] || '').trim().toLowerCase();
    if (targetEquip && eq !== targetEquip) continue;
    if (targetMuscle && primaryIdx !== -1) {
      const pm = String(row[primaryIdx] || '').trim().toLowerCase();
      if (pm !== targetMuscle) continue;
    }
    candidates.push(row);
  }

  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function replaceGlideWodExercise_(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureGlideWodSchema_();
  const sh = ss.getSheetByName(SHEET_GLIDE);
  const db = ss.getSheetByName(SHEET_DB);
  if (!sh || !db) return {status: 'error', msg: 'missing sheets'};

  const glideId = String(payload && payload.glideId ? payload.glideId : '').trim();
  if (!glideId) return {status: 'error', msg: 'missing glideId'};

  const data = sh.getDataRange().getValues();
  if (data.length < 2) return {status: 'error', msg: 'Glide_Wod empty'};
  const headers = data[0].map(h => String(h || '').trim());
  const lower = headers.map(h => String(h || '').toLowerCase());
  const idIdx = lower.indexOf('id');
  const userIdx = lower.indexOf('useremail');
  const equipIdx = lower.indexOf('equipment');
  const muscleIdx = lower.indexOf('muscles');
  const doReplaceIdx = lower.indexOf('doreplace');
  const exNameIdx = lower.indexOf('exercise');
  const exIdIdx = lower.indexOf('exercise_id');
  const repsTextIdx = lower.indexOf('reps_text');
  const weightIdx = lower.indexOf('weight_sugg');
  const videoIdx = lower.indexOf('video_url');
  const s1rIdx = lower.indexOf('set1_reps');
  const s1wIdx = lower.indexOf('set1_load');
  const s2rIdx = lower.indexOf('set2_reps');
  const s2wIdx = lower.indexOf('set2_load');
  const s3rIdx = lower.indexOf('set3_reps');
  const s3wIdx = lower.indexOf('set3_load');

  if (idIdx === -1) return {status: 'error', msg: 'Glide_Wod missing ID header'};

  let rowNum = -1;
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][idIdx] || '').trim() === glideId) { rowNum = r + 1; break; }
  }
  if (rowNum === -1) return {status: 'error', msg: 'glideId not found'};

  const existingRow = sh.getRange(rowNum, 1, 1, sh.getLastColumn()).getValues()[0];
  const currentEquip = equipIdx !== -1 ? String(existingRow[equipIdx] || '').trim() : '';
  const currentMuscle = muscleIdx !== -1 ? String(existingRow[muscleIdx] || '').trim() : '';
  const currentUser = userIdx !== -1 ? String(existingRow[userIdx] || '').trim() : '';
  const currentExerciseId = exIdIdx !== -1 ? String(existingRow[exIdIdx] || '').trim() : '';

  const dbRaw = db.getDataRange().getValues();
  const dbHeaders = dbRaw[0].map(h => String(h || '').trim());
  const dbData = dbRaw.slice(1);

  const requestedExerciseId = String(payload && payload.exerciseId ? payload.exerciseId : '').trim();
  const requestedEquip = String(payload && payload.equipment ? payload.equipment : '').trim();
  const requestedMuscle = String(payload && payload.muscle ? payload.muscle : '').trim();

  let chosen = null;
  if (requestedExerciseId) {
    chosen = getExerciceDbRowById_(dbData, dbHeaders, requestedExerciseId);
  }

  // When choosing randomly, avoid picking the same exercise as the current one.
  const maxTries = 12;
  for (let t = 0; t < maxTries && !chosen; t++) {
    const candidate = pickExerciseFromDb_(dbData, dbHeaders, {
      equipment: requestedEquip || currentEquip,
      muscle: requestedMuscle || currentMuscle
    });
    if (!candidate) break;
    const cIdIdx = idxOf(dbHeaders, ["id"]);
    const candidateId = cIdIdx !== -1 ? String(candidate[cIdIdx] || '').trim() : '';
    if (currentExerciseId && candidateId && candidateId === currentExerciseId) continue;
    chosen = candidate;
  }

  if (!chosen) {
    for (let t = 0; t < maxTries && !chosen; t++) {
      const candidate = pickExerciseFromDb_(dbData, dbHeaders, { equipment: requestedEquip || currentEquip });
      if (!candidate) break;
      const cIdIdx = idxOf(dbHeaders, ["id"]);
      const candidateId = cIdIdx !== -1 ? String(candidate[cIdIdx] || '').trim() : '';
      if (currentExerciseId && candidateId && candidateId === currentExerciseId) continue;
      chosen = candidate;
    }
  }

  if (!chosen) return {status: 'error', msg: 'no candidate exercise'};

  const dbNameIdx = idxOf(dbHeaders, ["nom complet", "name"]);
  const dbIdIdx = idxOf(dbHeaders, ["id"]);
  const dbEquipIdx = idxOf(dbHeaders, ["equipment", "equip"]);
  const dbPrimaryIdx = idxOf(dbHeaders, ["primary_muscle", "primary"]);
  const dbIsoIdx = idxOf(dbHeaders, ["type", "exercise_type", "isometric"]);

  const exoName = String(chosen[dbNameIdx] || '').trim();
  const exoId = dbIdIdx !== -1 ? String(chosen[dbIdIdx] || '').trim() : '';
  const exoEquip = dbEquipIdx !== -1 ? String(chosen[dbEquipIdx] || '').trim() : (requestedEquip || currentEquip);
  const exoMuscle = dbPrimaryIdx !== -1 ? String(chosen[dbPrimaryIdx] || '').trim() : (requestedMuscle || currentMuscle);

  let isIsometric = false;
  if (dbIsoIdx !== -1) {
    const isoVal = String(chosen[dbIsoIdx] || '').toLowerCase();
    if (isoVal.includes('isometric')) isIsometric = true;
  }

  const repsText = isIsometric ? 'Tenir 30-45s' : '10-12 reps';
  const histData = currentUser ? getHistoryDataForUser_(ss, currentUser, 500) : [];
  let weightSugg = getSuggestedLoad(exoName, histData, currentUser) || '';
  if (isIsometric && (!weightSugg || weightSugg === '—')) weightSugg = '30-45s';

  const updates = {};
  if (exNameIdx !== -1) updates[exNameIdx] = exoName;
  if (exIdIdx !== -1) updates[exIdIdx] = exoId;
  if (equipIdx !== -1) updates[equipIdx] = exoEquip;
  if (muscleIdx !== -1) updates[muscleIdx] = exoMuscle;
  if (repsTextIdx !== -1) updates[repsTextIdx] = repsText;
  if (weightIdx !== -1) updates[weightIdx] = weightSugg;
  if (videoIdx !== -1) updates[videoIdx] = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(exoName);
  // Allow AppSheet to trigger replacement by toggling DoReplace=TRUE.
  // Once processed, reset it so the user can tap again later.
  if (doReplaceIdx !== -1) updates[doReplaceIdx] = false;

  // Default per-set values only when blank.
  const defaultReps = isIsometric ? '' : 10;
  if (s1rIdx !== -1 && (existingRow[s1rIdx] === '' || existingRow[s1rIdx] == null)) updates[s1rIdx] = defaultReps;
  if (s2rIdx !== -1 && (existingRow[s2rIdx] === '' || existingRow[s2rIdx] == null)) updates[s2rIdx] = defaultReps;
  if (s3rIdx !== -1 && (existingRow[s3rIdx] === '' || existingRow[s3rIdx] == null)) updates[s3rIdx] = defaultReps;
  if (s1wIdx !== -1 && (String(existingRow[s1wIdx] || '').trim() === '')) updates[s1wIdx] = weightSugg;
  if (s2wIdx !== -1 && (String(existingRow[s2wIdx] || '').trim() === '')) updates[s2wIdx] = weightSugg;
  if (s3wIdx !== -1 && (String(existingRow[s3wIdx] || '').trim() === '')) updates[s3wIdx] = weightSugg;

  const outRow = existingRow.slice();
  Object.keys(updates).forEach(k => {
    const idx = parseInt(k, 10);
    outRow[idx] = updates[idx];
  });

  sh.getRange(rowNum, 1, 1, sh.getLastColumn()).setValues([outRow]);
  SpreadsheetApp.flush();
  return {status: 'ok', glideId: glideId, exerciseId: exoId, exercise: exoName, equipment: exoEquip, muscle: exoMuscle, weight_sugg: weightSugg, reps_text: repsText};
}

if (typeof MUSCLE_RECOVERY === 'undefined') var MUSCLE_RECOVERY = {
  "Chest": 48, "Back": 48, "Legs": 72, "Shoulders": 48, 
  "Biceps": 24, "Triceps": 24, "Abs": 24, "Core": 24,
  "Quads": 72, "Hamstrings": 72, "Glutes": 72, "Calves": 48
};

function normalizeMuscleKey_(m) {
  const raw = String(m || '').trim();
  if (!raw) return '';
  const key = raw.toLowerCase().replace(/\s+/g, ' ');

  const alias = {
    'upperback': 'upper back',
    'lowerback': 'lower back',
    'midback': 'mid back',
    'hipflexors': 'hip flexors',
    'innerthighs': 'inner thighs',
    'outerthighs': 'outer thighs',
    'posteriorchain': 'posterior chain',
    'ankles': 'calves',
    'shoulder': 'shoulders',
    'hip': 'hips',
    'quad': 'quads',
    'hamstring': 'hamstrings',
    'glute': 'glutes',
    'calf': 'calves',
    'tricep': 'triceps',
    'bicep': 'biceps',
    'oblique': 'obliques',
    'ab': 'abs'
  };

  const normalized = alias[key] || key;
  // Title Case words for stable keys in fatigue map + dashboard.
  return normalized.split(' ').map(w => w ? (w.charAt(0).toUpperCase() + w.slice(1)) : '').join(' ').trim();
}

function isMuscleKeyAllowed_(muscleKey) {
  const k = normalizeMuscleKey_(muscleKey);
  if (!k) return false;
  // Obvious non-muscle garbage values that can slip into the DB.
  if (k === 'Category') return false;
  return true;
}

function getRecoveryTimeForMuscle_(muscleKey) {
  const m = normalizeMuscleKey_(muscleKey);
  if (!m) return 48;

  if (MUSCLE_RECOVERY[m]) return MUSCLE_RECOVERY[m];

  // Map common sub-groups to legacy groups
  const ml = m.toLowerCase();
  if (ml.includes('back')) return MUSCLE_RECOVERY['Back'] || 48;
  if (ml.includes('quad')) return MUSCLE_RECOVERY['Quads'] || 72;
  if (ml.includes('hamstring')) return MUSCLE_RECOVERY['Hamstrings'] || 72;
  if (ml.includes('glute')) return MUSCLE_RECOVERY['Glutes'] || 72;
  if (ml.includes('calf')) return MUSCLE_RECOVERY['Calves'] || 48;
  if (ml.includes('bicep')) return MUSCLE_RECOVERY['Biceps'] || 24;
  if (ml.includes('tricep')) return MUSCLE_RECOVERY['Triceps'] || 24;
  if (ml.includes('shoulder')) return MUSCLE_RECOVERY['Shoulders'] || 48;
  if (ml.includes('abs')) return MUSCLE_RECOVERY['Abs'] || 24;
  if (ml.includes('core') || ml.includes('oblique')) return MUSCLE_RECOVERY['Core'] || 24;

  return 48;
}

function getExerciceDBMuscleGroups_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const db = ss.getSheetByName(SHEET_DB);
  if (!db || db.getLastRow() < 2) return [];

  // Prefer finding columns by header to avoid index drift.
  const data = db.getDataRange().getValues();
  const headers = data[0].map(h => String(h || '').trim());
  const lower = headers.map(h => String(h || '').toLowerCase());
  const fatigueIdx = lower.indexOf('fatigue');
  const primaryIdx = lower.indexOf('primary_muscle');

  const set = {};

  // Include primary_muscle domain
  if (primaryIdx !== -1) {
    for (let i = 1; i < data.length; i++) {
      const pm = normalizeMuscleKey_(data[i][primaryIdx]);
      if (isMuscleKeyAllowed_(pm)) set[pm] = true;
    }
  }

  // Include Fatigue keys domain
  if (fatigueIdx !== -1) {
  for (let i = 1; i < data.length; i++) {
    const f = String(data[i][fatigueIdx] || '').trim();
    if (!f || f.indexOf(':') === -1) continue;
    String(f).split(';').forEach(p => {
      const parts = String(p || '').split(':');
      if (parts.length < 2) return;
      const key = normalizeMuscleKey_(parts[0]);
      if (isMuscleKeyAllowed_(key)) set[key] = true;
    });
  }
  }

  const muscles = Object.keys(set);
  muscles.sort();
  return muscles;
}

function getDashboardMuscleList_() {
  // Stable ordering: keep legacy major muscles first, then add any extra groups from ExerciceDB.
  const major = ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Core", "Abs", "Quads", "Hamstrings", "Glutes", "Calves"];
  const fromDb = getExerciceDBMuscleGroups_();
  const seen = {};
  const out = [];

  major.forEach(m => {
    const k = normalizeMuscleKey_(m);
    if (isMuscleKeyAllowed_(k) && !seen[k]) { out.push(k); seen[k] = true; }
  });
  (fromDb || []).forEach(m => {
    const k = normalizeMuscleKey_(m);
    if (isMuscleKeyAllowed_(k) && !seen[k]) { out.push(k); seen[k] = true; }
  });

  return out;
}

/* ===================== MENU ===================== */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('FITBOOK')
    .addItem('⚡ GÉNÉRER LA SÉANCE', 'generateWorkout') 
    .addItem('✉️ Générer pour un email…', 'generateWorkoutPrompt')
    .addSeparator()
    .addItem('⏱ Ouvrir le Timer', 'openTimerSidebar')
    .addSeparator()
    .addItem('🔄 Mettre à jour les Menus', 'refreshCategoryDropdowns')
    .addSeparator()
    .addSubMenu(SpreadsheetApp.getUi().createMenu('🧠 Body Fatigue')
      .addItem('📊 Mettre à jour Dashboard', 'testUpdateDash')
      .addItem('♻️ Reset Fatigue', 'resetFatigueTest'))
    .addSeparator()
    .addItem('✅ Valider (Historique)', 'saveWorkout')
    .addToUi();
}

function generateWorkoutPrompt() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('Générer la séance', 'Email utilisateur (ex: verojanelle79@gmail.com)', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const email = String(res.getResponseText() || '').trim();
  if (!email || !email.includes('@')) {
    ui.alert('Email invalide');
    return;
  }
  generateWorkout(email);
  ui.alert('Génération lancée pour: ' + email);
}

function normalizeKey_(k) {
  return String(k || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function readAnyField_(obj, keys) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const k of (keys || [])) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) return obj[k];
  }
  // fallback: normalized matching (handles spaces/underscores)
  const normMap = {};
  Object.keys(obj).forEach((k) => { normMap[normalizeKey_(k)] = obj[k]; });
  for (const k of (keys || [])) {
    const v = normMap[normalizeKey_(k)];
    if (v !== undefined) return v;
  }
  return undefined;
}

function openTimerSidebar() {
  const html = HtmlService
    .createHtmlOutputFromFile('Timer')
    .setTitle('Timer');
  SpreadsheetApp.getUi().showSidebar(html);
}

function openTimerDialog() {
  const html = HtmlService
    .createHtmlOutputFromFile('Timer')
    .setWidth(360)
    .setHeight(520);
  SpreadsheetApp.getUi().showModalDialog(html, 'Timer');
}

function testUpdateDash() {
  updateRecoveryDashboard(Session.getActiveUser().getEmail());
}

function getSs() {
  const SS_ID = "1o0jp22IWRGJ5siqpEbNvCd5R6t-kcXaWoPVZ0kzgFPA"; 
  return SpreadsheetApp.openById(SS_ID);
}

function idxOfAny_(headers, names) {
  const lower = (headers || []).map(h => String(h || '').trim().toLowerCase());
  for (const n of (names || [])) {
    const i = lower.indexOf(String(n).toLowerCase());
    if (i !== -1) return i;
  }
  return -1;
}

function parseFocusMusclesFromType_(selectedType) {
  const raw = String(selectedType || '').trim().toLowerCase();
  if (!raw) return [];

  // Common muscle keys we want to support in free-form session type names.
  const canon = {
    chest: 'chest',
    back: 'back',
    shoulders: 'shoulders',
    shoulder: 'shoulders',
    biceps: 'biceps',
    bicep: 'biceps',
    triceps: 'triceps',
    tricep: 'triceps',
    abs: 'abs',
    ab: 'abs',
    core: 'core',
    legs: 'legs',
    quads: 'quads',
    quad: 'quads',
    hamstrings: 'hamstrings',
    hamstring: 'hamstrings',
    glutes: 'glutes',
    glute: 'glutes',
    calves: 'calves',
    calf: 'calves'
  };

  // Normalize separators and split into tokens.
  const tokens = raw
    .replace(/&|\+|\//g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(Boolean);

  const out = [];
  const add = (k) => {
    const v = canon[k];
    if (!v) return;
    if (out.indexOf(v) === -1) out.push(v);
  };

  // Handle phrases like "upper back" / "lower back" as back.
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if ((t === 'upper' || t === 'lower') && tokens[i + 1] === 'back') {
      add('back');
      i++;
      continue;
    }
    add(t);
  }

  // If user says core, treat abs as acceptable too, and vice-versa.
  if (out.indexOf('core') !== -1 && out.indexOf('abs') === -1) out.push('abs');
  if (out.indexOf('abs') !== -1 && out.indexOf('core') === -1) out.push('core');

  return out;
}

function normalizeMuscleKey_(value) {
  const s = String(value || '').trim().toLowerCase();
  if (!s) return '';

  // Back-related synonyms often present in exercise databases.
  if (s.includes('lat')) return 'back';
  if (s.includes('middle back')) return 'back';
  if (s.includes('upper back')) return 'back';
  if (s.includes('lower back')) return 'back';

  // Core-related synonyms.
  if (s.includes('abdominal')) return 'abs';
  if (s.includes('oblique')) return 'abs';
  if (s.includes('midsection')) return 'abs';

  // Keep core/abs aligned.
  if (s === 'core') return 'core';
  if (s === 'abs') return 'abs';

  return s;
}

function muscleMatchesAnyFocus_(primaryMuscleRaw, focusMusclesRaw) {
  const primary = normalizeMuscleKey_(primaryMuscleRaw);
  if (!primary) return false;
  const focus = (focusMusclesRaw || []).map(normalizeMuscleKey_).filter(Boolean);
  if (focus.length === 0) return true;

  const primarySet = new Set([primary]);
  if (primary === 'core') primarySet.add('abs');
  if (primary === 'abs') primarySet.add('core');

  for (const f of focus) {
    if (!f) continue;
    const fSet = new Set([f]);
    if (f === 'core') fSet.add('abs');
    if (f === 'abs') fSet.add('core');

    for (const p of primarySet) {
      for (const ff of fSet) {
        if (p === ff) return true;
        // Partial match fallback (handles "back" vs "upper back" if not normalized).
        if (p.includes(ff) || ff.includes(p)) return true;
      }
    }
  }
  return false;
}

function getUserProfileConfig_(shGen, targetUserEmail) {
  const data = shGen.getDataRange().getValues();
  if (!data || data.length < 2) return {error: 'UserProfile empty'};

  const headers = data[0].map(h => String(h || '').trim());
  const hasHeader = headers.some(h => /email|user/i.test(h));
  const headersLower = headers.map(h => String(h || '').trim().toLowerCase());

  const idxOfAnySubstr_ = (needles) => {
    const ns = (needles || []).map(n => String(n || '').trim().toLowerCase()).filter(Boolean);
    if (ns.length === 0) return -1;
    for (let i = 0; i < headersLower.length; i++) {
      const h = headersLower[i] || '';
      if (!h) continue;
      for (const n of ns) {
        if (h.includes(n)) return i;
      }
    }
    return -1;
  };

  const pickBestHeaderIndex_ = (scorer) => {
    let bestIdx = -1;
    let bestScore = -999999;
    for (let i = 0; i < headersLower.length; i++) {
      const h = headersLower[i] || '';
      if (!h) continue;
      const score = scorer(h);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    return (bestScore > 0) ? bestIdx : -1;
  };

  const scoreTargetCountHeader_ = (h) => {
    let s = 0;
    const hasEx = h.includes('exerc') || h.includes('exercise');
    const hasCount = h.includes('count') || h.includes('nb') || h.includes('nombre') || h.includes('nbr');
    const isDuration = h.includes('dur') || h.includes('minute') || (h === 'min') || h.includes('minutes');
    const isHiiTSpecific = h.includes('hiit') || h.includes('tabata');
    if (hasEx) s += 8;
    if (hasCount) s += 4;
    if (isHiiTSpecific) s -= 6;
    if (isDuration) s -= 20;
    return s;
  };

  const scoreSetCountHeader_ = (h) => {
    let s = 0;
    const hasSet = h.includes('set') || h.includes('sets');
    const hasCount = h.includes('count') || h.includes('nb') || h.includes('nombre') || h.includes('nbr');
    const isDuration = h.includes('dur') || h.includes('minute') || h.includes('min');
    if (hasSet) s += 8;
    if (hasCount) s += 4;
    if (isDuration) s -= 20;
    return s;
  };

  const scoreHiitMinutesHeader_ = (h) => {
    let s = 0;
    const hasHiit = h.includes('hiit') || h.includes('tabata');
    const hasMinutes = h.includes('minute') || h.includes('minutes') || h.includes('dur') || (h === 'min');
    const hasExercise = h.includes('exerc') || h.includes('exercise');
    if (hasHiit) s += 10;
    if (hasMinutes) s += 6;
    if (hasExercise) s -= 10;
    return s;
  };

  // Prefer header-based lookup (robust to AppSheet schema changes)
  let emailIdx = hasHeader ? idxOfAny_(headers, ['UserEmail', 'Email', 'E-mail', 'Mail']) : -1;

  // NOTE:
  // - "selectedType" is the recipe/session selector (ex: "Core Back", "Pilates Wall Lower Body")
  // - "programType" is the high-level mode (Strength/Pilates/Yoga/HIIT)
  // We try hard not to confuse the two even if a column is named "Type".
  let selectedTypeIdx = hasHeader ? idxOfAny_(
    headers,
    ['SelectedType', 'SessionType', 'Type_Séance', 'Type Seance', 'Type_scéance_Voulue', 'Type_séance_Voulue', 'Séance', 'Seance', 'Programme', 'Program', 'Type']
  ) : -1;
  let programTypeIdx = hasHeader ? idxOfAny_(
    headers,
    ['ProgramType', 'WorkoutType', 'Workout Type', 'Discipline', 'Mode', 'Type_Programme', 'Type Programme']
  ) : -1;

  let equipIdx = hasHeader ? idxOfAny_(headers, ['Equipment', 'Equip', 'Matériel', 'Materiel']) : -1;
  let aliasIdx = hasHeader ? idxOfAny_(headers, ['Alias', 'DisplayName', 'Display Name', 'Pseudo', 'Nickname']) : -1;
  let targetCountIdx = hasHeader ? idxOfAny_(headers, ['TargetCount', 'Target Count', 'Exercises', 'ExerciseCount', 'Nb_Exercices', 'Count']) : -1;
  let setCountIdx = hasHeader ? idxOfAny_(headers, ['SetCount', 'Set Count', 'Sets', 'Nb_Sets']) : -1;

  // Extra resilience: pick best matching columns by scoring headers.
  // This avoids the common bug: "Durée" (minutes) being mistaken for exercise count.
  if (hasHeader) {
    const bestTargetIdx = pickBestHeaderIndex_(scoreTargetCountHeader_);
    if (bestTargetIdx !== -1) targetCountIdx = bestTargetIdx;

    const bestSetIdx = pickBestHeaderIndex_(scoreSetCountHeader_);
    if (bestSetIdx !== -1) setCountIdx = bestSetIdx;
  }

  // HIIT settings (optional)
  // Accept both accented and non-accented, any case: Durée, Duree, DUREE
  let hiitMinutesIdx = hasHeader ? idxOfAny_(headers, [
    'HIIT_Minutes', 'HIIT Minutes', 'HIIT_Duration', 'HIIT Duration',
    'DurationMinutes', 'Duration Minutes', 'Minutes',
    'Durée', 'Duree', 'DUREE', 'DURÉE'
  ]) : -1;
  let hiitWorkIdx = hasHeader ? idxOfAny_(headers, ['HIIT_WorkSeconds', 'HIIT WorkSeconds', 'HIIT_Work', 'WorkSeconds', 'Work Seconds', 'Work_s', 'Work']) : -1;
  let hiitRestIdx = hasHeader ? idxOfAny_(headers, ['HIIT_RestSeconds', 'HIIT RestSeconds', 'HIIT_Rest', 'RestSeconds', 'Rest Seconds', 'Rest_s', 'Rest']) : -1;
  let hiitAllowJumpsIdx = hasHeader ? idxOfAny_(headers, ['HIIT_AllowJumps', 'AllowJumps', 'Allow Jumps', 'Jumps', 'Sauts']) : -1;

  // Fallback to legacy fixed positions if header missing / not found
  if (emailIdx === -1) emailIdx = 1;
  if (selectedTypeIdx === -1) selectedTypeIdx = 5;
  if (equipIdx === -1) equipIdx = 4;
  if (targetCountIdx === -1) targetCountIdx = 7;
  if (setCountIdx === -1) setCountIdx = 8;

  // For HIIT, prefer a HIIT+minutes column if possible.
  if (hasHeader) {
    const bestHiitMinutesIdx = pickBestHeaderIndex_(scoreHiitMinutesHeader_);
    if (bestHiitMinutesIdx !== -1) hiitMinutesIdx = bestHiitMinutesIdx;
  }

  // Smart fallback: some profiles have column H = Durée (minutes) and column I = Nombre d'exercices.
  // In that case, the legacy fallback (H as targetCount) produces "20 exercises" when duration is 20.
  if (headersLower.length >= 9) {
    const h = headersLower[7] || '';
    const i = headersLower[8] || '';
    const hLooksLikeDuration = h.includes('dur') || h.includes('minute') || h.includes('min');
    const iLooksLikeExercises = i.includes('exerc');
    const hLooksLikeExercises = h.includes('exerc');
    const iLooksLikeDuration = i.includes('dur') || i.includes('minute') || i.includes('min');
    if (hLooksLikeDuration && iLooksLikeExercises) {
      targetCountIdx = 8;
    } else if (hLooksLikeExercises && iLooksLikeDuration) {
      targetCountIdx = 7;
    }
  }

  // IMPORTANT: do not hard-stop at RECIPES_START_ROW.
  // Some workbooks have more users below the recipes section.
  let userRow = null;
  const target = String(targetUserEmail || '').trim().toLowerCase();
  for (let r = 1; r < data.length; r++) {
    let candidate = String(data[r][emailIdx] || '').trim().toLowerCase();
    if (!candidate) {
      // Fallback: search the whole row for the email if the expected column is empty.
      for (let c = 0; c < data[r].length; c++) {
        const cell = String(data[r][c] || '').trim().toLowerCase();
        if (cell && cell === target) {
          userRow = data[r];
          break;
        }
      }
      if (userRow) break;
    }
    if (candidate && candidate === target) {
      userRow = data[r];
      break;
    }
  }
  if (!userRow) return {error: 'Utilisateur introuvable', email: targetUserEmail, emailIdx: emailIdx, headers: headers.slice(0, 30)};

  const selectedType = String(userRow[selectedTypeIdx] || '').trim();
  let programType = (programTypeIdx !== -1) ? String(userRow[programTypeIdx] || '').trim() : '';

  // If the sheet only has one column and the user put a high-level value into selectedType,
  // interpret it as programType.
  const stLower = selectedType.toLowerCase();
  if (!programType && (stLower === 'strength' || stLower === 'pilates' || stLower === 'yoga' || stLower === 'hiit')) {
    programType = selectedType;
  }

  // Infer programType from selectedType keywords if missing.
  if (!programType) {
    const c = String(selectedType || '').toLowerCase();
    if (c.includes('pilates')) programType = 'Pilates';
    else if (c.includes('yoga')) programType = 'Yoga';
    else if (c.includes('hiit') || c.includes('tabata')) programType = 'HIIT';
    else programType = 'Strength';
  }
  const targetCount = parseInt(userRow[targetCountIdx], 10) || 8;
  const setCount = parseInt(userRow[setCountIdx], 10) || 3;
  const rawEquipText = String(userRow[equipIdx] || '').trim();
  const alias = (aliasIdx !== -1) ? String(userRow[aliasIdx] || '').trim() : '';

  const hiitMinutesRaw = (hiitMinutesIdx !== -1) ? userRow[hiitMinutesIdx] : '';
  const hiitWorkRaw = (hiitWorkIdx !== -1) ? userRow[hiitWorkIdx] : '';
  const hiitRestRaw = (hiitRestIdx !== -1) ? userRow[hiitRestIdx] : '';
  const hiitAllowJumpsRaw = (hiitAllowJumpsIdx !== -1) ? userRow[hiitAllowJumpsIdx] : '';

  const hiitMinutes = parseInt(hiitMinutesRaw, 10);
  const hiitWorkSeconds = parseInt(hiitWorkRaw, 10);
  const hiitRestSeconds = parseInt(hiitRestRaw, 10);
  const hiitAllowJumps = (String(hiitAllowJumpsRaw || '').toLowerCase() === 'true') || String(hiitAllowJumpsRaw || '') === '1' || hiitAllowJumpsRaw === true;

  return {
    selectedType,
    programType,
    targetCount,
    setCount,
    rawEquipText,
    alias,
    hiit: {
      minutes: isNaN(hiitMinutes) ? null : hiitMinutes,
      workSeconds: isNaN(hiitWorkSeconds) ? null : hiitWorkSeconds,
      restSeconds: isNaN(hiitRestSeconds) ? null : hiitRestSeconds,
      allowJumps: hiitAllowJumps
    },
    indices: {
      emailIdx, selectedTypeIdx, programTypeIdx, equipIdx, aliasIdx, targetCountIdx, setCountIdx,
      hiitMinutesIdx, hiitWorkIdx, hiitRestIdx, hiitAllowJumpsIdx
    }
  };
}

function generateForProgramType_(triggerEmail) {
  const requestedEmail = (typeof triggerEmail === 'string') ? triggerEmail : Session.getActiveUser().getEmail();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shGen = ss.getSheetByName(SHEET_GEN);
  if (!shGen) return {status: 'error', msg: 'UserProfile missing'};
  const profile = getUserProfileConfig_(shGen, requestedEmail);
  if (profile.error) return {status: 'error', msg: profile.error};
  const pt = String(profile.programType || '').trim().toLowerCase();
  if (pt === 'hiit') {
    generateHIITWorkout(requestedEmail);
    return {status: 'ok', generated: 'hiit'};
  }
  // Yoga has a dedicated UI/flow; do not generate Strength rows.
  if (pt === 'yoga') {
    return {status: 'skipped', reason: 'yoga_flow'};
  }
  generateWorkout(requestedEmail);
  return {status: 'ok', generated: 'strength'};
}

function generateHIITWorkout(triggerEmail) {
  const requestedEmail = (typeof triggerEmail === 'string') ? triggerEmail : Session.getActiveUser().getEmail();
  console.log('>>> Démarrage génération HIIT pour : ' + requestedEmail);

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { console.error('Serveur occupé'); return; }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shGen = ss.getSheetByName(SHEET_GEN);
  const shDb = ss.getSheetByName(SHEET_DB);
  if (!shGen || !shDb) { lock.releaseLock(); return; }

  const profile = getUserProfileConfig_(shGen, requestedEmail);
  if (profile.error) {
    console.error(profile.error + ' : ' + requestedEmail);
    lock.releaseLock();
    return;
  }

  // SOURCE OF TRUTH email
  let targetUserEmail = String(requestedEmail || '').trim();
  try {
    const pData = shGen.getDataRange().getValues();
    const emailIdx = profile && profile.indices ? profile.indices.emailIdx : 1;
    const wanted = String(requestedEmail || '').trim().toLowerCase();
    for (let r = 1; r < pData.length; r++) {
      const cell = String(pData[r][emailIdx] || '').trim();
      if (cell && cell.toLowerCase() === wanted) { targetUserEmail = cell; break; }
    }
  } catch (e) {}

  // Defaults (user decision): 40/20; honor arbitrary durations
  const minutesRaw = (profile.hiit && profile.hiit.minutes != null) ? parseInt(profile.hiit.minutes, 10) : 10;
  const durationMinutes = (isNaN(minutesRaw) || minutesRaw <= 0) ? 10 : minutesRaw;
  const workSeconds = (profile.hiit && profile.hiit.workSeconds != null) ? parseInt(profile.hiit.workSeconds, 10) : 40;
  const restSeconds = (profile.hiit && profile.hiit.restSeconds != null) ? parseInt(profile.hiit.restSeconds, 10) : 20;
  const allowJumps = (profile.hiit && profile.hiit.allowJumps === true) ? true : false;

  const uniqueCount = Math.max(1, Math.min(5, durationMinutes));

  // Load ExerciceDB
  const dbDataRaw = shDb.getDataRange().getValues();
  const dbHeaders = dbDataRaw[0].map(h => String(h || '').trim());
  const dbData = dbDataRaw.slice(1);
  const lower = dbHeaders.map(h => String(h || '').toLowerCase());

  const idx = (names) => {
    for (const n of names) {
      const i = lower.indexOf(String(n).toLowerCase());
      if (i !== -1) return i;
    }
    return -1;
  };

  const idxName = idx(['nom complet', 'name', 'exercise', 'exercice']);
  const idxId = idx(['id']);
  const idxEquip = idx(['equipment', 'equip', 'matériel', 'materiel']);
  const idxPrimary = idx(['primary_muscle', 'primary']);
  const idxBodyCat = idx(['body_category', 'category']);
  const idxDiscipline = idx(['discipline', 'workout_discipline', 'program_type', 'programtype']);
  const idxPlyo = idx(['plyometric', 'plyo']);
  const idxTags = idx(['tags', 'tag']);

  let candidates = dbData.filter((row) => {
    const name = idxName !== -1 ? String(row[idxName] || '').trim() : '';
    if (!name) return false;
    if (idxDiscipline !== -1) {
      const d = String(row[idxDiscipline] || '').trim().toLowerCase();
      if (d !== 'hiit') return false;
    } else {
      // Fallback if no discipline column: rely on tags containing 'hiit'
      const tags = idxTags !== -1 ? String(row[idxTags] || '').toLowerCase() : '';
      if (tags && !tags.includes('hiit')) return false;
    }
    if (!allowJumps && idxPlyo !== -1) {
      const v = String(row[idxPlyo] || '').trim().toLowerCase();
      const isTrue = (v === 'true' || v === '1' || v === 'yes' || v === 'y');
      if (isTrue) return false;
    }
    return true;
  });

  if (candidates.length === 0) {
    console.error('HIIT: aucune ligne candidate dans ExerciceDB (discipline/tags/plyometric).');
    lock.releaseLock();
    return;
  }

  // Simple variety heuristic: try to spread across body categories
  const buckets = {};
  const bucketOrder = ['full body', 'lower body', 'upper body', 'core', 'cardio'];
  candidates.forEach((row) => {
    const b = idxBodyCat !== -1 ? String(row[idxBodyCat] || '').trim().toLowerCase() : '';
    const key = b || 'other';
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(row);
  });

  function pickFromBucket_(key, usedKeysSet) {
    const arr = buckets[key] || [];
    if (arr.length === 0) return null;
    for (let tries = 0; tries < 20; tries++) {
      const row = arr[Math.floor(Math.random() * arr.length)];
      const nm = idxName !== -1 ? String(row[idxName] || '').trim() : '';
      const idv = idxId !== -1 ? String(row[idxId] || '').trim() : '';
      const k = (idv || nm).toLowerCase();
      if (k && !usedKeysSet.has(k)) return row;
    }
    return null;
  }

  const picked = [];
  const used = new Set();
  // First pass: preferred buckets
  for (const b of bucketOrder) {
    if (picked.length >= uniqueCount) break;
    const row = pickFromBucket_(b, used);
    if (!row) continue;
    const nm = idxName !== -1 ? String(row[idxName] || '').trim() : '';
    const idv = idxId !== -1 ? String(row[idxId] || '').trim() : '';
    const k = (idv || nm).toLowerCase();
    if (k) used.add(k);
    picked.push(row);
  }
  // Fill remaining randomly
  let guard = 0;
  while (picked.length < uniqueCount && guard < 200) {
    guard++;
    const row = candidates[Math.floor(Math.random() * candidates.length)];
    const nm = idxName !== -1 ? String(row[idxName] || '').trim() : '';
    const idv = idxId !== -1 ? String(row[idxId] || '').trim() : '';
    const k = (idv || nm).toLowerCase();
    if (!k || used.has(k)) continue;
    used.add(k);
    picked.push(row);
  }

  if (picked.length === 0) {
    console.error('HIIT: impossible de sélectionner des exos.');
    lock.releaseLock();
    return;
  }

  // Ensure sheet and write
  ensureGlideHiitSchema_();
  const shHiit = ss.getSheetByName(SHEET_HIIT);
  if (!shHiit) { lock.releaseLock(); return; }

  const lastCol = shHiit.getLastColumn();
  const headers = shHiit.getRange(1, 1, 1, Math.max(1, lastCol)).getValues()[0].map(h => String(h || '').trim());
  const lowerHiit = headers.map(h => String(h || '').toLowerCase());
  const userIdx = lowerHiit.indexOf('useremail');

  const all = (shHiit.getLastRow() > 1) ? shHiit.getRange(2, 1, shHiit.getLastRow() - 1, lastCol).getValues() : [];
  const keep = (userIdx === -1) ? all : all.filter(r => String(r[userIdx] || '').trim().toLowerCase() !== String(targetUserEmail).trim().toLowerCase());

  const now = new Date();
  const intervalLabel = String(workSeconds) + '/' + String(restSeconds);
  // Compute total intervals based on duration and work/rest cycle length
  const totalSeconds = Math.max(1, parseInt(durationMinutes, 10)) * 60;
  const cycleSeconds = Math.max(1, parseInt(workSeconds, 10) + parseInt(restSeconds, 10));
  const intervalCount = Math.max(1, Math.floor(totalSeconds / cycleSeconds));
  const out = [];
  for (let order = 1; order <= intervalCount; order++) {
    const slotIdx = (order - 1) % picked.length;
    const round = Math.floor((order - 1) / picked.length) + 1;
    const slotInRound = ((order - 1) % picked.length) + 1;
    const exRow = picked[slotIdx];
    const exName = idxName !== -1 ? String(exRow[idxName] || '').trim() : '';
    const exId = idxId !== -1 ? exRow[idxId] : '';
    const exEquip = idxEquip !== -1 ? String(exRow[idxEquip] || '').trim() : 'bodyweight';
    const exPrimary = idxPrimary !== -1 ? String(exRow[idxPrimary] || '').trim() : '';
    const videoUrl = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(exName);

    const row = new Array(lastCol).fill('');
    const idCol = lowerHiit.indexOf('id');
    const orderCol = lowerHiit.indexOf('order');
    const roundCol = lowerHiit.indexOf('round');
    const slotCol = lowerHiit.indexOf('slot_in_round');
    const exCol = lowerHiit.indexOf('exercise');
    const exIdCol = lowerHiit.indexOf('exercise_id');
    const primCol = lowerHiit.indexOf('primary_muscle');
    const equipCol = lowerHiit.indexOf('equipment');
    const workCol = lowerHiit.indexOf('work_s');
    const restCol = lowerHiit.indexOf('rest_s');
    const labelCol = lowerHiit.indexOf('interval_label');
    const urlCol = lowerHiit.indexOf('video_url');
    const doneCol = lowerHiit.indexOf('is_done');
    const createdCol = lowerHiit.indexOf('createdat');

    if (idCol !== -1) row[idCol] = targetUserEmail + '_HIIT_' + order;
    if (orderCol !== -1) row[orderCol] = order;
    if (roundCol !== -1) row[roundCol] = round;
    if (slotCol !== -1) row[slotCol] = slotInRound;
    if (exCol !== -1) row[exCol] = exName;
    if (exIdCol !== -1) row[exIdCol] = exId;
    if (primCol !== -1) row[primCol] = exPrimary;
    if (equipCol !== -1) row[equipCol] = exEquip;
    if (workCol !== -1) row[workCol] = workSeconds;
    if (restCol !== -1) row[restCol] = restSeconds;
    if (labelCol !== -1) row[labelCol] = intervalLabel;
    if (urlCol !== -1) row[urlCol] = videoUrl;
    if (doneCol !== -1) row[doneCol] = false;
    if (userIdx !== -1) row[userIdx] = targetUserEmail;
    if (createdCol !== -1) row[createdCol] = now;
    out.push(row);
  }

  const final = keep.concat(out);

  // Ensure sheet has enough size to write (some workbooks may have trimmed rows/cols).
  if (shHiit.getMaxColumns() < lastCol) {
    shHiit.insertColumnsAfter(shHiit.getMaxColumns(), lastCol - shHiit.getMaxColumns());
  }
  const neededRows = 1 + final.length;
  if (shHiit.getMaxRows() < neededRows) {
    shHiit.insertRowsAfter(shHiit.getMaxRows(), neededRows - shHiit.getMaxRows());
  }

  if (shHiit.getLastRow() > 1) {
    shHiit.getRange(2, 1, shHiit.getLastRow() - 1, lastCol).clearContent();
  }
  if (final.length > 0) {
    shHiit.getRange(2, 1, final.length, lastCol).setValues(final);
  }

  SpreadsheetApp.flush();
  lock.releaseLock();
  console.log('>>> HIIT terminé pour ' + targetUserEmail + ' (' + durationMinutes + ' min, ' + (out.length) + ' intervals)');
}

function getHiitTimerData_(userEmail) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_HIIT);
  if (!sh || sh.getLastRow() < 2) return {status: 'error', msg: 'Glide_HIIT empty'};

  const requested = String(userEmail || '').trim();
  const fallback = Session.getActiveUser ? String(Session.getActiveUser().getEmail() || '').trim() : '';
  const targetEmail = requested || fallback;
  if (!targetEmail) return {status: 'error', msg: 'missing userEmail'};

  const lastCol = sh.getLastColumn();
  const headers = sh.getRange(1, 1, 1, Math.max(1, lastCol)).getValues()[0].map(h => String(h || '').trim());
  const lower = headers.map(h => h.toLowerCase());
  const idx = (name) => lower.indexOf(String(name || '').toLowerCase());

  const emailIdx = idx('useremail');
  const orderIdx = idx('order');
  const roundIdx = idx('round');
  const slotIdx = idx('slot_in_round');
  const exIdx = idx('exercise');
  const workIdx = idx('work_s');
  const restIdx = idx('rest_s');
  const labelIdx = idx('interval_label');
  const urlIdx = idx('video_url');
  const doneIdx = idx('is_done');

  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, lastCol).getValues();
  const out = [];
  rows.forEach((r) => {
    if (emailIdx !== -1) {
      const em = String(r[emailIdx] || '').trim().toLowerCase();
      if (em !== String(targetEmail).trim().toLowerCase()) return;
    }
    out.push({
      order: orderIdx !== -1 ? Number(r[orderIdx]) : null,
      round: roundIdx !== -1 ? Number(r[roundIdx]) : null,
      slotInRound: slotIdx !== -1 ? Number(r[slotIdx]) : null,
      exercise: exIdx !== -1 ? String(r[exIdx] || '').trim() : '',
      work_s: workIdx !== -1 ? Number(r[workIdx]) : 40,
      rest_s: restIdx !== -1 ? Number(r[restIdx]) : 20,
      intervalLabel: labelIdx !== -1 ? String(r[labelIdx] || '').trim() : '',
      videoUrl: urlIdx !== -1 ? String(r[urlIdx] || '').trim() : '',
      isDone: doneIdx !== -1 ? (String(r[doneIdx]).trim().toLowerCase() === 'true' || String(r[doneIdx]).trim() === '1') : false
    });
  });

  out.sort((a, b) => {
    const ao = Number.isFinite(a.order) ? a.order : 999999;
    const bo = Number.isFinite(b.order) ? b.order : 999999;
    return ao - bo;
  });

  return {
    status: 'ok',
    userEmail: targetEmail,
    total: out.length,
    items: out
  };
}

// Exposed to Timer.html via google.script.run
function getHiitTimerData(userEmail) {
  return getHiitTimerData_(userEmail);
}

// Best-effort: returns the active user's email when available.
// Note: For consumer Gmail accounts / some deployments, this may be blank.
function getUserEmail() {
  let email = '';
  try {
    if (Session.getActiveUser) email = String(Session.getActiveUser().getEmail() || '').trim();
  } catch (e) {
    email = '';
  }
  return {status: 'ok', email: String(email || '').trim()};
}

function setHiitIsDone_(userEmail, order, isDone) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_HIIT);
  if (!sh || sh.getLastRow() < 2) return {status: 'error', msg: 'Glide_HIIT empty'};

  const targetEmail = String(userEmail || '').trim();
  if (!targetEmail) return {status: 'error', msg: 'missing userEmail'};
  const ord = parseInt(order, 10);
  if (!Number.isFinite(ord) || ord <= 0) return {status: 'error', msg: 'invalid order'};

  const lastCol = sh.getLastColumn();
  const headers = sh.getRange(1, 1, 1, Math.max(1, lastCol)).getValues()[0].map(h => String(h || '').trim());
  const lower = headers.map(h => h.toLowerCase());
  const emailIdx = lower.indexOf('useremail');
  const orderIdx = lower.indexOf('order');
  const doneIdx = lower.indexOf('is_done');
  if (emailIdx === -1 || orderIdx === -1 || doneIdx === -1) {
    return {status: 'error', msg: 'Glide_HIIT schema missing required columns'};
  }

  const values = sh.getRange(2, 1, sh.getLastRow() - 1, lastCol).getValues();
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const em = String(row[emailIdx] || '').trim().toLowerCase();
    const o = parseInt(row[orderIdx], 10);
    if (em === targetEmail.toLowerCase() && o === ord) {
      sh.getRange(2 + i, 1 + doneIdx).setValue(!!isDone);
      SpreadsheetApp.flush();
      return {status: 'ok', userEmail: targetEmail, order: ord, isDone: !!isDone};
    }
  }
  return {status: 'error', msg: 'row not found', userEmail: targetEmail, order: ord};
}

function setHiitIsDone(userEmail, order, isDone) {
  return setHiitIsDone_(userEmail, order, isDone);
}

function setHiitRoundDone_(userEmail, roundNumber, isDone) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_HIIT);
  if (!sh || sh.getLastRow() < 2) return {status: 'error', msg: 'Glide_HIIT empty'};

  const targetEmail = String(userEmail || '').trim();
  if (!targetEmail) return {status: 'error', msg: 'missing userEmail'};
  const rnd = parseInt(roundNumber, 10);
  if (!Number.isFinite(rnd) || rnd <= 0) return {status: 'error', msg: 'invalid round'};

  const lastCol = sh.getLastColumn();
  const headers = sh.getRange(1, 1, 1, Math.max(1, lastCol)).getValues()[0].map(h => String(h || '').trim());
  const lower = headers.map(h => h.toLowerCase());
  const emailIdx = lower.indexOf('useremail');
  const roundIdx = lower.indexOf('round');
  const doneIdx = lower.indexOf('is_done');
  if (emailIdx === -1 || roundIdx === -1 || doneIdx === -1) {
    return {status: 'error', msg: 'Glide_HIIT schema missing required columns'};
  }

  const values = sh.getRange(2, 1, sh.getLastRow() - 1, lastCol).getValues();
  let updated = 0;
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const em = String(row[emailIdx] || '').trim().toLowerCase();
    const r = parseInt(row[roundIdx], 10);
    if (em === targetEmail.toLowerCase() && r === rnd) {
      sh.getRange(2 + i, 1 + doneIdx).setValue(!!isDone);
      updated++;
    }
  }
  SpreadsheetApp.flush();
  return {status: 'ok', userEmail: targetEmail, round: rnd, updated: updated, isDone: !!isDone};
}

function setHiitRoundDone(userEmail, roundNumber, isDone) {
  return setHiitRoundDone_(userEmail, roundNumber, isDone);
}

function syncSetsFromGlideOutput_(ss, userEmail, glideOutputRows) {
  // Keep Sets sheet in sync for AppSheet workflows that still depend on it.
  try {
    ensureSetsSchema();
  } catch (e) {
    // If SetsHelpers isn't loaded for some reason, bail safely.
    return {status: 'skipped', error: 'ensureSetsSchema unavailable'};
  }

  const shSets = ss.getSheetByName('Sets');
  if (!shSets) return {status: 'error', msg: 'Sets missing'};

  const lastRow = shSets.getLastRow();
  const lastCol = shSets.getLastColumn();
  const headers = shSets.getRange(1, 1, 1, Math.max(1, lastCol)).getValues()[0].map(h => String(h || '').trim());
  const lower = headers.map(h => h.toLowerCase());
  const idIdx = lower.indexOf('id');
  const glideIdx = lower.indexOf('glide_wod_id');
  const exIdx = lower.indexOf('exercise');
  const exDispIdx = lower.indexOf('exercise_display');
  const setNumIdx = lower.indexOf('setnumber');
  const repsIdx = lower.indexOf('reps');
  const loadIdx = lower.indexOf('load');
  const notesIdx = lower.indexOf('notes');

  if (glideIdx === -1 || exIdx === -1 || setNumIdx === -1) return {status: 'error', msg: 'Sets schema missing required columns'};

  const existing = (lastRow > 1) ? shSets.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];
  const prefix = String(userEmail || '').trim().toLowerCase() + '_';
  const keep = existing.filter(r => {
    const g = String(r[glideIdx] || '').trim().toLowerCase();
    return !(prefix && g.startsWith(prefix));
  });

  const newRows = [];
  for (const g of (glideOutputRows || [])) {
    const glideId = String(g[0] || '').trim();
    const exerciseName = String(g[4] || '').trim();
    const exerciseId = g[5];

    const exerciseKey = (exerciseId !== '' && exerciseId != null) ? String(exerciseId).trim() : exerciseName;
    const exerciseDisplay = exerciseName || (typeof getExerciseDisplayName === 'function' ? getExerciseDisplayName(exerciseKey) : '') || '';

    const setReps = [g[9], g[11], g[13]];
    const setLoads = [g[10], g[12], g[14]];

    for (let s = 1; s <= 3; s++) {
      const row = new Array(lastCol).fill('');
      if (idIdx !== -1) row[idIdx] = glideId + '_S' + s;
      row[glideIdx] = glideId;
      row[exIdx] = exerciseKey;
      if (exDispIdx !== -1) row[exDispIdx] = exerciseDisplay;
      row[setNumIdx] = s;
      if (repsIdx !== -1) row[repsIdx] = setReps[s - 1] != null ? setReps[s - 1] : '';
      if (loadIdx !== -1) row[loadIdx] = setLoads[s - 1] != null ? setLoads[s - 1] : '';
      if (notesIdx !== -1) row[notesIdx] = '';
      newRows.push(row);
    }
  }

  const final = keep.concat(newRows);
  if (lastRow > 1) shSets.getRange(2, 1, lastRow - 1, lastCol).clearContent();
  if (final.length > 0) shSets.getRange(2, 1, final.length, lastCol).setValues(final);

  try { applySetsDataValidation(); } catch (e) {}
  return {status: 'ok', kept: keep.length, written: newRows.length};
}

/* ===================== GÉNÉRATEUR PRINCIPAL ===================== */
function generateWorkout(triggerEmail) {
  const requestedEmail = (typeof triggerEmail === 'string') ? triggerEmail : Session.getActiveUser().getEmail();
  console.log(">>> Démarrage génération pour : " + requestedEmail);

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { console.error("Serveur occupé"); return; }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shGen = ss.getSheetByName(SHEET_GEN);
  const shDb = ss.getSheetByName(SHEET_DB);
  let shGlide = ss.getSheetByName(SHEET_GLIDE);

  if (!shGen || !shDb) { lock.releaseLock(); return; }

  // 1. PROFIL (header-based, resilient)
  const profile = getUserProfileConfig_(shGen, requestedEmail);
  if (profile.error) {
    console.error(profile.error + ' : ' + requestedEmail);
    lock.releaseLock();
    return;
  }

  // SOURCE OF TRUTH: use the exact email stored in UserProfile.
  let targetUserEmail = String(requestedEmail || '').trim();
  try {
    const pData = shGen.getDataRange().getValues();
    const emailIdx = profile && profile.indices ? profile.indices.emailIdx : 1;
    const wanted = String(requestedEmail || '').trim().toLowerCase();
    for (let r = 1; r < pData.length; r++) {
      const cell = String(pData[r][emailIdx] || '').trim();
      if (cell && cell.toLowerCase() === wanted) {
        targetUserEmail = cell;
        break;
      }
    }
  } catch (e) {}

  const selectedType = profile.selectedType;
  const programType = String(profile.programType || '').trim();
  const targetCount = profile.targetCount;
  const setCount = profile.setCount;
  const rawEquipText = profile.rawEquipText;

  // Safety: ensure Durée (minutes) is persisted in column H for Strength profiles
  try {
    const minutesVal = (profile && profile.hiit && profile.hiit.minutes) ? profile.hiit.minutes : null;
    if (minutesVal != null) {
      const pData2 = shGen.getDataRange().getValues();
      const emailIdx2 = profile && profile.indices ? profile.indices.emailIdx : 1;
      const wanted2 = String(targetUserEmail || requestedEmail || '').trim().toLowerCase();
      for (let r = 1; r < pData2.length; r++) {
        const cell2 = String(pData2[r][emailIdx2] || '').trim().toLowerCase();
        if (cell2 && cell2 === wanted2) {
          try { shGen.getRange(r + 1, 8).setValue(minutesVal); } catch (e) {}
          break;
        }
      }
    }
  } catch (e) {}

  // Équipement
  let userEquip = [];
  const aliasEquip = {
    "dumbell": "dumbbells", "db": "dumbbells", "haltères": "dumbbells",
    "body weight": "bodyweight", "bw": "bodyweight", "none": "bodyweight", "kb": "kettlebell"
  };
  // If the high-level mode isn't Strength, ignore equipment completely.
  // AppSheet will hide the field; this keeps generation consistent even if a stale value exists.
  const programTypeLower = programType.toLowerCase();
  const shouldIgnoreEquipment = programTypeLower && programTypeLower !== 'strength';

  if (!shouldIgnoreEquipment && rawEquipText) {
    userEquip = rawEquipText.split(",").map(s => {
       let k = s.trim().toLowerCase();
       return aliasEquip[k] || k;
    }).filter(Boolean);
  } else { userEquip = ["bodyweight"]; }

  // Guardrail: if the workbook explicitly uses ProgramType/WorkoutType and it is HIIT or Yoga,
  // do not generate a sets-based Strength workout into Glide_Wod.
  // (HIIT will use Glide_HIIT and Yoga will use YogaPlayer / a dedicated flow.)
  if ((profile.indices && profile.indices.programTypeIdx !== -1) && (programTypeLower === 'hiit' || programTypeLower === 'yoga')) {
    console.error("Type '" + programType + "' détecté: génération Strength (Glide_Wod) désactivée. Utiliser le flow HIIT/Yoga dédié.");
    lock.releaseLock();
    return;
  }

  // 2. RECETTES
  const recipesData = shGen.getRange(RECIPES_START_ROW, 1, RECIPES_ROWS, 24).getValues();
  const recipeRow = recipesData.find(r => String(r[1] || "").trim().toLowerCase() === selectedType.trim().toLowerCase());
  
  if (!recipeRow) { console.error("Recette introuvable"); lock.releaseLock(); return; }
  
  const baseRecipe = recipeRow.slice(1, 26).map(c => String(c || "").trim());
  let fullPlan = [];
  while (fullPlan.length < targetCount) fullPlan = fullPlan.concat(baseRecipe);
  fullPlan = fullPlan.slice(0, targetCount);

  // 3. DB & HISTO
  const dbDataRaw = shDb.getDataRange().getValues();
  const dbHeaders = dbDataRaw[0].map(h => String(h || "").trim());
  const dbData = dbDataRaw.slice(1);
  const shHist = ss.getSheetByName(SHEET_HIST);
  const histData = (shHist && shHist.getLastRow() > 1) ? shHist.getRange(2, 1, shHist.getLastRow() - 1, 11).getValues().reverse() : [];

  // 4. PREP GLIDE (ensure schema, do not clear)
  ensureGlideWodSchema_();
  shGlide = ss.getSheetByName(SHEET_GLIDE);

  // 5. FILTRES INTELLIGENTS
  const typeClean = String(selectedType).toLowerCase().replace(/\s/g, "");
  
  // DÉTECTION : Si le nom contient "pilates" (ex: "Pilates Wall Lower Body")
  const isPilatesMode = typeClean.includes("pilates");

  if (isPilatesMode) {
    userEquip.push("bodyweight"); 
  }

  const userConstraints = {
    avoidKnees: false,
    avoidLowerBack: false,
    fatigueMap: getMuscleFatigueMap(targetUserEmail),
    targetCategories: [],
    // TRÈS IMPORTANT : On utilise "pilates" pour matcher "pilates, wall"
    strictCategory: isPilatesMode ? "pilates" : null,
    // If session type contains muscle words (ex: "core back"), enforce a strict muscle focus.
    strictMuscles: parseFocusMusclesFromType_(selectedType),
    // Optional discipline filter if ExerciceDB has a 'Discipline' column.
    discipline: programTypeLower || ''
  };

  // 6. GÉNÉRATION
  const output = [];
  let order = 1;
  const usedExerciseKeys = new Set();
  let lastExerciseKey = null;
  const nameIdxForDedupe = idxOf(dbHeaders, ["nom complet", "name", "exercise"]);
  const idIdxForDedupe = idxOf(dbHeaders, ["id"]);

  fullPlan.forEach(slotRaw => {
    const slot = String(slotRaw || "").trim();
    const targetCats = slot === "" ? [] : slot.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    userConstraints.targetCategories = targetCats;

    let selected = null;
    let attempts = 0;
    
    while (attempts < 10) {
      selected = pickRandomExercise(null, dbData, dbHeaders, userEquip, userConstraints);
      if (!selected) break;

      const exoName = String(selected[nameIdxForDedupe] || "").trim();
      const exoIdRaw = (idIdxForDedupe !== -1) ? selected[idIdxForDedupe] : "";
      const exoId = String(exoIdRaw || "").trim();
      const key = exoId ? exoId : exoName.toLowerCase();

      if (!key) { attempts++; continue; }
      if (usedExerciseKeys.has(key)) { attempts++; continue; }
      if (lastExerciseKey && key === lastExerciseKey) { attempts++; continue; }

      break;
    }

    let exoName = "⚠️ Vide (" + (slot || "vide") + ")";
    let equipName = "—";
    let repsText = "10-12 reps";
    let weightSugg = "";
    let videoUrl = "";

    if (selected) {
      const nameIdx = idxOf(dbHeaders, ["nom complet", "name"]);
      const idIdx = idxOf(dbHeaders, ["id"]);
      const equipIdx = idxOf(dbHeaders, ["equipment", "equip"]);
      const isoIdx = idxOf(dbHeaders, ["type", "exercise_type"]);
      const catIdx = idxOf(dbHeaders, ["category", "body_category"]);
      const primaryMuscleIdx = idxOf(dbHeaders, ["primary_muscle", "primary"]);

      exoName = String(selected[nameIdx] || "").trim() || exoName;
      const exoId = (idIdx !== -1) ? selected[idIdx] : "";
      equipName = String(selected[equipIdx] || "—").trim();
      videoUrl = "https://www.youtube.com/results?search_query=" + encodeURIComponent(exoName);
      weightSugg = getSuggestedLoad(exoName, histData, targetUserEmail) || "";

      let isIsometric = false;

      if (isoIdx !== -1 && String(selected[isoIdx]).toLowerCase().includes("isometric")) {
        isIsometric = true;
        repsText = "Tenir 30-45s";
        if (!weightSugg || weightSugg === "—") weightSugg = "30-45s";
      }

      let realCategory = (catIdx !== -1 && selected[catIdx]) ? String(selected[catIdx]).trim() : slot;
      let primaryMuscle = (primaryMuscleIdx !== -1 && selected[primaryMuscleIdx]) ? String(selected[primaryMuscleIdx]).trim() : "";

      const repsPerSet = isIsometric ? '' : 10;
      const s1r = setCount >= 1 ? repsPerSet : '';
      const s2r = setCount >= 2 ? repsPerSet : '';
      const s3r = setCount >= 3 ? repsPerSet : '';
      const s1w = setCount >= 1 ? weightSugg : '';
      const s2w = setCount >= 2 ? weightSugg : '';
      const s3w = setCount >= 3 ? weightSugg : '';

      let uniqueID = targetUserEmail + "_" + order;
      output.push([uniqueID, order, realCategory, primaryMuscle, exoName, exoId, equipName, repsText, weightSugg, s1r, s1w, s2r, s2w, s3r, s3w, videoUrl, false, false, targetUserEmail]);
      order++;

      const dedupeKey = String(exoId || '').trim() ? String(exoId).trim() : String(exoName || '').trim().toLowerCase();
      if (dedupeKey) {
        usedExerciseKeys.add(dedupeKey);
        lastExerciseKey = dedupeKey;
      }
    } else {
      let uniqueID = targetUserEmail + "_" + order;
      output.push([uniqueID, order, slot, "", exoName, "", equipName, repsText, "", "", "", "", "", "", "", "", false, false, targetUserEmail]);
      order++;
    }
  });

  // 7. ECRITURE
  const outWidth = (output && output.length > 0) ? output[0].length : shGlide.getLastColumn();
  const glideCols = Math.max(shGlide.getLastColumn(), outWidth);
  if (shGlide.getMaxColumns() < glideCols) {
    shGlide.insertColumnsAfter(shGlide.getMaxColumns(), glideCols - shGlide.getMaxColumns());
  }

  const glideHeaders = shGlide.getRange(1, 1, 1, glideCols).getValues()[0];
  const glideUserIdx = glideHeaders.map(h => String(h || '').trim().toLowerCase()).indexOf('useremail');
  var allData = [];
  if (shGlide.getLastRow() > 1) {
    allData = shGlide.getRange(2, 1, shGlide.getLastRow() - 1, glideCols).getValues();
  }
  // IMPORTANT: never wipe other users' data.
  // If we can't find UserEmail column, we can't safely filter, so we append.
  if (glideUserIdx === -1) {
    if (output.length > 0) {
      const startRow = shGlide.getLastRow() + 1;
      const normalized = output.map(r => {
        const row = (r || []).slice(0, glideCols);
        while (row.length < glideCols) row.push('');
        return row;
      });
      shGlide.getRange(startRow, 1, normalized.length, glideCols).setValues(normalized);
    }
  } else {
    var rowsToKeep = allData.filter(r => String(r[glideUserIdx]).trim().toLowerCase() !== String(targetUserEmail).trim().toLowerCase());
    var finalData = rowsToKeep.concat(output);

    if (shGlide.getLastRow() > 1) {
      shGlide.getRange(2, 1, shGlide.getLastRow() - 1, glideCols).clearContent();
    }
    if (finalData.length > 0) {
      const normalized = finalData.map(r => {
        const row = (r || []).slice(0, glideCols);
        while (row.length < glideCols) row.push('');
        return row;
      });
      shGlide.getRange(2, 1, normalized.length, glideCols).setValues(normalized);
    }
  }

  // 7b. SYNC SETS (3 sets per Glide exercise)
  syncSetsFromGlideOutput_(ss, targetUserEmail, output);

  updateRecoveryDashboard(targetUserEmail);
  SpreadsheetApp.flush();
  lock.releaseLock();
  console.log(">>> Terminé pour " + targetUserEmail);
}

/* ===================== LOGIQUE SÉLECTION (PickRandom) ===================== */
/* ===================== LOGIQUE SÉLECTION (Recherche Panoramique) ===================== */
function pickRandomExercise(code, dbData, dbHeaders, userEquipList, userConstraints) {
  if (!dbData || dbData.length === 0) return null;

  // --- A. DÉFINITION DES INDEX ---
  const idxOfLocal = (names) => {
    const lower = dbHeaders.map(h => String(h || "").toLowerCase());
    for (let n of names) {
      if (lower.indexOf(n.toLowerCase()) !== -1) return lower.indexOf(n.toLowerCase());
    }
    return -1;
  };

  // On repère les colonnes clés
  const IDX_CAT_FILTER = idxOfLocal(["category", "body_category", "tags", "tag", "group"]);
  const IDX_NAME_LOCAL = idxOfLocal(["nom complet", "name", "exercise", "exercice"]);
  const IDX_EQUIP_LOCAL = idxOfLocal(["equipment", "equip", "matériel"]);
  const IDX_DISCIPLINE = idxOfLocal(["discipline", "workout_discipline", "program_type", "programtype"]);

  // --- B. GESTION DES FILTRES (MODE STRICT / PILATES) ---
  
  if (userConstraints.strictCategory) {
    const strictKeyword = userConstraints.strictCategory.toLowerCase(); // ex: "pilates"
    
    dbData = dbData.filter(row => {
      // 1. RECHERCHE PANORAMIQUE : On regarde partout !
      // On combine le contenu de la colonne Tags, Nom et Equipement
      const catVal = (IDX_CAT_FILTER !== -1) ? String(row[IDX_CAT_FILTER] || "") : "";
      const nameVal = (IDX_NAME_LOCAL !== -1) ? String(row[IDX_NAME_LOCAL] || "") : "";
      const equipVal = (IDX_EQUIP_LOCAL !== -1) ? String(row[IDX_EQUIP_LOCAL] || "") : "";
      
      const fullText = (catVal + " " + nameVal + " " + equipVal).toLowerCase();
      
      // Si le mot clé (ex: "pilates") est trouvé n'importe où, on garde la ligne
      return fullText.includes(strictKeyword); 
    });

    if (dbData.length === 0) return null; 
  }

  // --- B2. OPTIONAL DISCIPLINE FILTER (HIIT/Yoga/Pilates/Strength) ---
  // If ExerciceDB has a Discipline column, we can restrict selection to that mode.
  // Strength is permissive: blank Discipline is considered Strength.
  if (IDX_DISCIPLINE !== -1) {
    const want = String((userConstraints && userConstraints.discipline) || '').trim().toLowerCase();
    if (want) {
      dbData = dbData.filter(row => {
        const v = String(row[IDX_DISCIPLINE] || '').trim().toLowerCase();
        if (want === 'strength') return (v === '' || v === 'strength');
        return v === want;
      });
      if (dbData.length === 0) return null;
    }
  }

  // --- C. RECHERCHE PAR ÉQUIPEMENT & MUSCLES (Reste du code standard) ---
  
  const idxOf = (names) => { // Réutilisation de la fonction helper
    const lower = dbHeaders.map(h => String(h || "").toLowerCase());
    for (let n of names) { if (lower.indexOf(n.toLowerCase()) !== -1) return lower.indexOf(n.toLowerCase()); }
    return -1;
  };

  const IDX_CODE = idxOf(["code (group)", "code", "group"]);
  const IDX_PRIMARY = idxOf(["primary_muscle", "primary", "muscle"]);
  const IDX_EQUIP = idxOf(["equipment", "equip"]);
  
  // ALIAS CRUCIAUX : On s'assure que Pilates = Bodyweight
  const alias = { 
      "db": "dumbbells", "haltères": "dumbbells", 
      "bw": "bodyweight", "none": "bodyweight", "poids du corps": "bodyweight",
      "kb": "kettlebell",
      "pilates wall": "bodyweight", "pilateswall": "bodyweight", "pilates": "bodyweight",
      "wall": "bodyweight" // Ajout de sécurité
  };
  
  const normalize = t => { let k = String(t || "").toLowerCase().trim(); return alias[k] || k; };
  let availableEquips = (userEquipList || []).map(u => normalize(u)).filter(Boolean);
  if (availableEquips.length === 0) availableEquips = ["bodyweight"];

  // Randomisation équipement
  const targetEquipForThisSlot = availableEquips[Math.floor(Math.random() * availableEquips.length)];
  const targetCats = (userConstraints.targetCategories || []).map(t => String(t).toLowerCase());
  const candidates = [];
  const strictMuscles = (userConstraints && userConstraints.strictMuscles) ? userConstraints.strictMuscles.map(s => String(s || '').toLowerCase()) : [];

  dbData.forEach(row => {
    if (code && String(row[IDX_CODE]).toLowerCase() !== String(code).toLowerCase()) return;

    const rowEquipRaw = String(row[IDX_EQUIP] || "").toLowerCase();
    let isMatch = false;
    
    // Logique Bodyweight souple
    if (targetEquipForThisSlot === "bodyweight") {
        isMatch = rowEquipRaw.includes("bodyweight") || rowEquipRaw === "" || rowEquipRaw === "none" || 
                  rowEquipRaw.includes("pilates") || rowEquipRaw.includes("wall"); // Sécurité max
    } else {
        isMatch = rowEquipRaw.includes(targetEquipForThisSlot);
    }
    
    if (!isMatch) return;

    let score = 10;
    const primaryMusc = String(row[IDX_PRIMARY] || "").toLowerCase();

    // If strict muscle focus is set, discard exercises outside that focus.
    // We accept partial matches so "upper back" matches "back".
    if (strictMuscles.length > 0) {
      if (!muscleMatchesAnyFocus_(primaryMusc, strictMuscles)) return;
    }
    targetCats.forEach(tc => { if (primaryMusc.includes(tc)) score += 50; });
    
    // Bonus si on est en mode strict et que le mot clé est trouvé
    if (userConstraints.strictCategory) {
        // On redonne un bonus pour être sûr de privilégier les meilleurs matchs
        if ((rowEquipRaw + primaryMusc).toLowerCase().includes(userConstraints.strictCategory)) score += 20;
    }

    candidates.push({ row: row, score: score });
  });

  if (candidates.length === 0) {
      // Fallback ultime
      dbData.forEach(row => {
        if (code && String(row[IDX_CODE]).toLowerCase() !== String(code).toLowerCase()) return;
        candidates.push({ row: row, score: 1 });
      });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score);
  const poolSize = Math.min(5, candidates.length);
  return candidates[Math.floor(Math.random() * poolSize)].row;
}

//* ===================== DASHBOARD UNIVERSEL (TOUS USERS) ===================== */

function updateRecoveryDashboard(e) {
  // On se fiche de l'argument 'e' (email ou event). On met à jour TOUT LE MONDE.
  console.log(">>> DÉBUT Mise à jour GLOBALE du Dashboard (Tous utilisateurs)");

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { console.log("Erreur Lock"); return; }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_DASH);
  const hist = ss.getSheetByName(SHEET_HIST);

  // Création de la feuille si elle n'existe pas
  if (!sheet) {
      sheet = ss.insertSheet(SHEET_DASH);
      sheet.appendRow(["UserEmail", "Muscle", "Fatigue_Percent", "Status"]);
  }
  
  if (!hist || hist.getLastRow() < 2) {
      console.log("Pas d'historique à traiter.");
      lock.releaseLock();
      return;
  }

  // 1. RECENSEMENT : On trouve tous les emails uniques dans l'historique (Col K / Index 10)
  // (Note: On lit la colonne 11, qui correspond à la lettre K)
  const histData = hist.getRange(2, 11, hist.getLastRow() - 1, 1).getValues();
  // On filtre pour avoir une liste propre et unique (ex: ["mathieu@...", "vero@..."])
  let uniqueEmails = [...new Set(histData.flat().map(e => String(e).trim().toLowerCase()).filter(e => e !== ""))];

  console.log("Utilisateurs trouvés : " + uniqueEmails.join(", "));

  // 2. CALCUL MASSIF : On boucle sur chaque personne
  // Muscle list is derived from ExerciceDB (primary_muscle + Fatigue keys), with stable ordering.
  let muscles = getDashboardMuscleList_();
  if (!muscles || muscles.length === 0) muscles = ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Core", "Quads", "Hamstrings", "Glutes", "Calves"];
  let allNewRows = [];

  uniqueEmails.forEach(email => {
      // On appelle la logique de calcul pour CET email spécifique
      const fMap = getMuscleFatigueMap(email);
      
      muscles.forEach(m => {
          let rawVal = fMap[m] || 0;
          let val = Math.min(100, Math.round(rawVal));
          let status = val < 40 ? "🟢 Frais" : (val < 70 ? "🟠 Chargé" : "🔴 Repos");
          
          // On ajoute la ligne au tableau global
          allNewRows.push([email, m, val / 100, status]); 
      });
  });

  // 3. REMPLACEMENT TOTAL : On efface les anciennes données et on met les nouvelles
  if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).clearContent();
  }

  if (allNewRows.length > 0) {
      sheet.getRange(2, 1, allNewRows.length, 4).setValues(allNewRows);
  }

  SpreadsheetApp.flush();
  lock.releaseLock();
  console.log(">>> FIN Mise à jour GLOBALE terminée.");
}

function getMuscleFatigueMap(targetEmail) {
  if (!targetEmail) targetEmail = Session.getActiveUser().getEmail();
  const ss = SpreadsheetApp.getActive();
  const hist = ss.getSheetByName(SHEET_HIST);
  const db = ss.getSheetByName(SHEET_DB);
  let fatigue = {};
  const now = new Date();

  if (!hist || hist.getLastRow() < 2) return fatigue;
  const histData = hist.getRange(2, 1, hist.getLastRow() - 1, 11).getValues();

  let dbIndex = {};
  if (db) {
    const dbData = db.getDataRange().getValues();
    dbData.slice(1).forEach(r => {
      dbIndex[String(r[DB_COL_NAME] || "").trim().toLowerCase()] = r;
    });
  }

  // Group History rows by (timestamp + exercise) so multiple rows represent multiple sets.
  // This lets fatigue scale with number of sets without changing the History schema.
  const groups = {};
  const targetEmailLower = String(targetEmail).trim().toLowerCase();
  histData.forEach(r => {
    const histEmail = String(r[10] || "").trim().toLowerCase();
    if (histEmail !== targetEmailLower) return;

    const date = new Date(r[0]);
    if (isNaN(date.getTime())) return;
    const hAgo = (now - date) / 36e5;

    const rawName = String(r[4] || "").trim();
    const cleanName = rawName.split(" - S")[0].trim().toLowerCase().split(" [")[0].trim();
    if (!cleanName) return;

    const key = String(date.getTime()) + '|' + cleanName;
    if (!groups[key]) {
      groups[key] = { hAgo: hAgo, setCount: 0, musclesToHit: {} };
    }
    groups[key].setCount++;

    let musclesToHit = {};
    // Plan A : DB Fatigue column
    if (dbIndex[cleanName] && dbIndex[cleanName][DB_COL_FATIGUE]) {
      musclesToHit = parseMuscleMap(dbIndex[cleanName][DB_COL_FATIGUE]);
    } else {
      // Plan B : Fallback Historique
      const directMuscle = String(r[3] || "").trim();
      if (directMuscle) {
        const formattedMuscle = normalizeMuscleKey_(directMuscle);
        if (formattedMuscle) musclesToHit[formattedMuscle] = 1;
      }
    }

    // Merge muscle weights (keep the max weight per muscle).
    Object.keys(musclesToHit).forEach(m => {
      const k2 = normalizeMuscleKey_(m);
      if (!k2) return;
      const w = musclesToHit[m] || 1;
      const prev = groups[key].musclesToHit[k2] || 0;
      groups[key].musclesToHit[k2] = Math.max(prev, w);
    });
  });

  // Impact is proportional to sets done: 3 sets ~= 100% of base impact.
  const BASE_IMPACT_PER_EXERCISE = 50;
  const BASE_SETS = 3;

  Object.keys(groups).forEach(k => {
    const g = groups[k];
    const setFactor = Math.min(1, (g.setCount || 1) / BASE_SETS);
    Object.keys(g.musclesToHit).forEach(m => {
      const targetMuscle = normalizeMuscleKey_(m);
      if (!targetMuscle) return;

      const recoveryTime = getRecoveryTimeForMuscle_(targetMuscle);
      if (g.hAgo < recoveryTime) {
        const decay = 1 - (g.hAgo / recoveryTime);
        const weight = g.musclesToHit[m] || 1;
        const impact = weight * BASE_IMPACT_PER_EXERCISE * setFactor;
        fatigue[targetMuscle] = Math.min(100, (fatigue[targetMuscle] || 0) + (impact * decay));
      }
    });
  });
  
  return fatigue;
}

function parseMuscleMap(str) {
  if (!str) return {};
  let o = {};
  String(str).split(";").forEach(p => {
    let parts = p.split(":");
    if (parts.length < 2) return;
    let v = parseFloat(parts[1]);
    const key = normalizeMuscleKey_(parts[0]);
    if (!isNaN(v) && isMuscleKeyAllowed_(key)) o[key] = v;
  });
  return o;
}

 //////////////////////////////////////////////////////////////

function getSuggestedLoad(exoName, histData, targetEmail) {
  if (!exoName || !histData) return "";
  const key = String(exoName).trim().toLowerCase();
  
  const lastEntry = histData.find(row => {
    return String(row[10]).trim().toLowerCase() === String(targetEmail).trim().toLowerCase() &&
           String(row[4]).trim().toLowerCase() === key;
  });
  
  if (lastEntry && lastEntry[7]) return lastEntry[7];
  return "";
}

function idxOf(headers, names) {
  const lower = headers.map(h => String(h || "").toLowerCase());
  for (let n of names) {
    let i = lower.indexOf(n.toLowerCase());
    if (i !== -1) return i;
  }
  return -1;
}







































/* ===================== FONCTIONS UI / PLAYER (RESTAURÉES) ===================== */
function replaceSelectedExercise() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const wod = ss.getSheetByName(SHEET_WOD);
  const gen = ss.getSheetByName(SHEET_GEN);
  const db = ss.getSheetByName(SHEET_DB);

  const row = wod.getActiveCell().getRow();
  if (row < 2) { ss.toast("Sélectionnez une case exercice."); return; }

  let titleRow = row - ((row - 2) % 5);
  let codeLabel = wod.getRange(titleRow, 3).getValue();
  let code = String(codeLabel).replace("🟦 ", "").trim();

  // On récupère le matériel depuis les settings de la feuille
  const rawEquip = gen.getRange("D2:D5").getValues().flat(); // À adapter si votre UserProfile a changé
  const userEquip = rawEquip.map(v => String(v || "").trim()).filter(Boolean);
  
  const dbData = db.getDataRange().getValues();
  dbData.shift(); 
  const dbHeaders = db.getRange(1, 1, 1, db.getLastColumn()).getValues()[0];

  const userConstraints = {
    avoidKnees: false, // Legacy
    avoidLowerBack: false,
    fatigueMap: getMuscleFatigueMap(Session.getActiveUser().getEmail()),
    targetCategories: []
  };

  let newExo = pickRandomExercise(code, dbData, dbHeaders, userEquip, userConstraints);

  if (newExo) {
    let rawName = newExo[DB_COL_NAME];
    let equip = newExo[DB_COL_EQUIP];
    let finalName = rawName + " [" + equip + "]";
    let searchUrl = "https://www.youtube.com/results?search_query=" + encodeURIComponent(rawName);
    let formula = `=HYPERLINK("${searchUrl}"; "${finalName} 📺")`;
    
    wod.getRange(titleRow, 4).setFormula(formula);

    let isIsometric = false;
    let repsText = "10-12 reps";
    if (newExo[DB_COL_ISO] && String(newExo[DB_COL_ISO]).toLowerCase().includes("isometric")) {
      isIsometric = true;
      repsText = "Tenir 30-45s";
    }

    // On utilise [] pour histData car mode manuel sheet
    let newLoad = getSuggestedLoad(rawName, [], Session.getActiveUser().getEmail());
    if (isIsometric && (newLoad === "—" || !newLoad)) newLoad = "30-45s";

    wod.getRange(titleRow + 1, 4, 3, 1).setValue(repsText);
    wod.getRange(titleRow + 1, 5, 3, 1).setValue(newLoad);

    ss.toast("Remplacé par : " + rawName);
  } else {
    ss.toast("Pas d'alternative trouvée.");
  }
}

function saveWorkout() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const wod = ss.getSheetByName(SHEET_WOD);
  let hist = ss.getSheetByName(SHEET_HIST);
  if (!hist) { 
    hist = ss.insertSheet(SHEET_HIST); 
    hist.appendRow(["Date", "Type", "Category", "Muscles", "Exercice", "Equip", "Reps", "Load", "Video", "Done", "UserEmail"]); 
  }

  const data = wod.getRange(2, 1, wod.getLastRow() - 1, 5).getValues();
  let saved = 0;
  const email = Session.getActiveUser().getEmail();

  for (let i = 0; i < data.length; i += 5) {
    if (data[i][0] === true) {
      let rawText = String(data[i][3]);
      let cleanName = rawText.split(" [")[0].replace(" 📺", "");
      let cleanEquip = rawText.includes("[") ? rawText.split("[")[1].split("]")[0] : "—";
      
      // Adaptation format colonne
      hist.appendRow([new Date(), "Manual", "", "", cleanName, cleanEquip, data[i + 1][3], data[i + 1][4], "", true, email]);
      saved++;
    }
  }
  
  if (saved > 0) { 
    wod.getRange("A2:A").removeCheckboxes(); 
    SpreadsheetApp.getActive().toast(saved + " exos sauvés !"); 
    updateRecoveryDashboard(email); 
  } else { 
    SpreadsheetApp.getUi().alert("Cochez les cases (Col A) des exos faits."); 
  }
}

function resetFatigueTest() {
  const h = SpreadsheetApp.getActive().getSheetByName(SHEET_HIST);
  // Attention: cela efface TOUT l'historique (dangereux en multi-user).
  // Je laisse la fonction mais je conseille de l'utiliser avec prudence.
  if (h && h.getLastRow() > 1) h.getRange(2, 1, h.getLastRow() - 1, 11).clearContent();
  updateRecoveryDashboard(Session.getActiveUser().getEmail());
}



function getWodData() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_WOD);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  
  const range = sheet.getRange(2, 1, lastRow - 1, 5);
  const values = range.getValues();
  const formulas = range.getFormulas();
  let exercises = [];
  
  for (let i = 0; i < values.length; i += 5) {
    if (!values[i] || !values[i][3]) continue;
    if (!values[i + 1] || !values[i + 2] || !values[i + 3]) break;
    
    let rawFormula = formulas[i] ? formulas[i][3] : "";
    let videoUrl = "#";
    if (rawFormula && String(rawFormula).includes("http")) {
      let match = String(rawFormula).match(/"(https?:\/\/[^"]+)"/);
      if (match) videoUrl = match[1];
    }
    
    let rawName = String(values[i][3]);
    let cleanName = rawName.split(" [")[0].replace(" 📺", "");
    
    exercises.push({
      row: i + 2,
      group: values[i][2] ? String(values[i][2]).replace("🟦 ", "") : "EXO",
      name: cleanName,
      videoUrl: videoUrl,
      r1: values[i + 1][3] || "", w1: values[i + 1][4] || "",
      r2: values[i + 2][3] || "", w2: values[i + 2][4] || "",
      r3: values[i + 3][3] || "", w3: values[i + 3][4] || ""
    });
  }
  return exercises;
}

function saveFullSet(row, r1, w1, r2, w2, r3, w3) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_WOD);
  sheet.getRange(row + 1, 4).setValue(r1); sheet.getRange(row + 1, 5).setValue(w1);
  sheet.getRange(row + 2, 4).setValue(r2); sheet.getRange(row + 2, 5).setValue(w2);
  sheet.getRange(row + 3, 4).setValue(r3); sheet.getRange(row + 3, 5).setValue(w3);
  sheet.getRange(row, 1).setValue(true);
}

function onEdit(e) {
  const range = e.range;
  const sheet = range.getSheet();
  if (sheet.getName() !== SHEET_WOD) return;
  
  const row = range.getRow();
  const col = range.getColumn();
  if (row < 2 || (row - 2) % 5 !== 0) return;
  
  if (col === 3) {
    updateExerciseDropdown(sheet, row, e.value);
  }
  if (col === 4) {
    updateExerciseDetails(sheet, row, e.value);
  }
}

function updateExerciseDropdown(sheet, row, categoryCode) {
  const cellExo = sheet.getRange(row, 4);
  if (!categoryCode || categoryCode === "") {
    cellExo.clearContent().clearDataValidations();
    return;
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dbSheet = ss.getSheetByName(SHEET_DB);
  const dbData = dbSheet.getDataRange().getValues();
  const dbHeaders = dbSheet.getRange(1, 1, 1, dbSheet.getLastColumn()).getValues()[0].map(h => String(h || "").trim());
  const idxGroup = dbHeaders.map(h => String(h || "").toLowerCase()).indexOf("code (group)");
  
  let filteredList = [];
  if (idxGroup !== -1) {
    filteredList = dbData.slice(1)
      .filter(r => String(r[idxGroup]).trim().toUpperCase() === String(categoryCode).trim().toUpperCase())
      .map(r => r[DB_COL_NAME]);
  } else {
    filteredList = dbData.slice(1).map(r => r[DB_COL_NAME]);
  }
  
  filteredList.sort();
  
  if (filteredList.length > 0) {
    const rule = SpreadsheetApp.newDataValidation().requireValueInList(filteredList, true).setAllowInvalid(true).build();
    cellExo.setValue("");
    cellExo.setDataValidation(rule);
  } else {
    cellExo.clearDataValidations().setValue("Aucun exo");
  }
}

function updateExerciseDetails(sheet, row, exerciseName) {
  if (!exerciseName || exerciseName === "") return;
  
  let cleanName = String(exerciseName).split(" [")[0].replace(" 📺", "").trim();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dbSheet = ss.getSheetByName(SHEET_DB);
  const histSheet = ss.getSheetByName(SHEET_HIST);
  const dbData = dbSheet.getDataRange().getValues();
  
  let exoData = dbData.find(r => String(r[DB_COL_NAME]).trim().toLowerCase() === cleanName.toLowerCase());
  if (!exoData) return;
  
  let suggestedLoad = getSuggestedLoad(cleanName, histSheet && histSheet.getLastRow() > 1 ? histSheet.getRange(2, 1, histSheet.getLastRow() - 1, 11).getValues().reverse() : [], Session.getActiveUser().getEmail());
  let isIsometric = (exoData[DB_COL_ISO] && String(exoData[DB_COL_ISO]).toLowerCase().includes("isometric"));
  let repsText = "10-12 reps";
  
  if (isIsometric) {
    repsText = "Tenir 30-45s";
    if (!suggestedLoad || suggestedLoad === "" || suggestedLoad === "—") {
      suggestedLoad = "30-45s";
    }
  }
  
  let equip = exoData[DB_COL_EQUIP];
  let searchUrl = "https://www.youtube.com/results?search_query=" + encodeURIComponent(cleanName);
  let finalName = cleanName + " [" + equip + "]";
  let formula = `=HYPERLINK("${searchUrl}"; "${finalName.replace(/"/g, '""')} 📺")`;
  
  sheet.getRange(row, 4).setFormula(formula);
  sheet.getRange(row + 1, 4, 3, 1).setValue(repsText);
  sheet.getRange(row + 1, 5, 3, 1).setValue(suggestedLoad);
  
  sheet.getRange(row, 4).setBackground("#e6f4ea");
  SpreadsheetApp.flush();
  Utilities.sleep(500);
  sheet.getRange(row, 4).setBackground(null);
}

/* ===================== WEBHOOK (POINT D'ENTRÉE) ===================== */
function doPost(e) {
  try {
    if (!e || !e.postData) return ContentService.createTextOutput(JSON.stringify({status: "error"}));
    const rawBody = String(e.postData.contents || '');
    const data = JSON.parse(rawBody);

    // Persist last payload for debugging (token-protected dump endpoint in doGet)
    try {
      const props = PropertiesService.getScriptProperties();
      props.setProperty('LAST_WEBHOOK_AT', new Date().toISOString());
      props.setProperty('LAST_WEBHOOK_RAW', rawBody.slice(0, 20000));
    } catch (err) {}

    // Best-effort extraction for AppSheet webhook payloads (and custom bodies)
    const action = String(
      (data && (data.action || data.Action || data.event || data.Event || data.type || data.Type)) || ''
    ).trim();
    const tableName = String(
      (data && (data.tableName || data.TableName || data.table || data.Table)) || ''
    ).trim();
    const eventType = String(
      (data && (data.eventType || data.EventType)) || ''
    ).trim();

    const rowObj = (data && (data.Row || data.row || data.Values || data.values)) ? (data.Row || data.row || data.Values || data.values) : null;

    // Email can arrive from many shapes. IMPORTANT:
    // AppSheet often sends `User` as the actor (the one who triggered the event),
    // which must NOT override the row's own Email when acting on UserProfile.
    const actorEmail = String(readAnyField_(data, ['user', 'User']) || '').trim();
    const explicitEmail = String(
      readAnyField_(data, ['userEmail', 'UserEmail', 'User Email', 'Email', 'email', 'Mail', 'mail']) ||
      ''
    ).trim();
    const rowEmail = String(
      readAnyField_(rowObj, ['userEmail', 'UserEmail', 'User Email', 'Email', 'email', 'Mail', 'mail', 'Utilisateur', 'utilisateur']) ||
      ''
    ).trim();
    
    // Explicit trigger (kept for backward compatibility)
    // Prefer explicit/row email over actor email.
    const forceEmail = (explicitEmail || rowEmail || '').trim();
    if ((action === "FORCE_REGENERATE" || data.action === "FORCE_REGENERATE") && forceEmail) {
      const res = generateForProgramType_(forceEmail);
      return ContentService.createTextOutput(JSON.stringify({status: "success", result: res}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // AppSheet UserProfile-change webhook: when the user edits their profile, regenerate their workout.
    // Supports either:
    // - Custom: {action:"USERPROFILE_UPDATED", userEmail:"...", token?}
    // - AppSheet standard-ish: {TableName:"UserProfile", EventType:"UPDATE", User:"..."}
    const isProfileAction = [
      'USERPROFILE_UPDATED',
      'USERPROFILE_CHANGED',
      'PROFILE_UPDATED',
      'PROFILE_CHANGED',
      'USER_PROFILE_UPDATED',
      'USER_PROFILE_CHANGED'
    ].indexOf(action.toUpperCase()) !== -1;
    const isUserProfileTable = String(tableName || '').toLowerCase() === String(SHEET_GEN || 'UserProfile').toLowerCase();
    const isUpdateEvent = String(eventType || '').toLowerCase() === 'update' || String(eventType || '').toLowerCase() === 'add';
    const regenEmail = (isUserProfileTable ? (rowEmail || explicitEmail) : (explicitEmail || rowEmail || actorEmail)).trim();
    const shouldRegenFromWebhook = regenEmail && (isProfileAction || (isUserProfileTable && (eventType ? isUpdateEvent : true)));
    if (shouldRegenFromWebhook) {
      // Optional token gate (if you include token in the webhook body)
      if (data.token && data.token !== "TEMP_CREATE_SETS_TOKEN_20260101") {
        return ContentService.createTextOutput(JSON.stringify({status: "error", msg: "invalid token"}))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const res = generateForProgramType_(regenEmail);
      return ContentService.createTextOutput(JSON.stringify({status: "success", regenerated: true, userEmail: regenEmail, result: res}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Explicit HIIT generation trigger
    if ((action || '').toUpperCase() === 'GENERATE_HIIT') {
      if (data.token && data.token !== 'TEMP_CREATE_SETS_TOKEN_20260101') {
        return ContentService.createTextOutput(JSON.stringify({status: 'error', msg: 'invalid token'}))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const email = (explicitEmail || rowEmail || actorEmail || '').trim();
      if (!email) {
        return ContentService.createTextOutput(JSON.stringify({status: 'error', msg: 'missing email'}))
          .setMimeType(ContentService.MimeType.JSON);
      }
      generateHIITWorkout(email);
      return ContentService.createTextOutput(JSON.stringify({status: 'success', generated: 'hiit', userEmail: email}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // --------------------
    // AppSheet -> Sheets sync helpers
    // --------------------
    const rowLower = {};
    if (rowObj && typeof rowObj === 'object') {
      Object.keys(rowObj).forEach((k) => {
        rowLower[normalizeKey_(k)] = rowObj[k];
      });
    }

    // 1) When a Set is edited in AppSheet, sync it back into Glide_Wod Set1/2/3 columns.
    // Recommended body:
    // { action:"SYNC_SET_TO_GLIDE", token, Row:{ Glide_Wod_ID:"...", SetNumber:1, Reps:10, Load:50 } }
    // Or AppSheet standard-ish:
    // { TableName:"Sets", EventType:"UPDATE", token, Row:{...} }
    const isSetsEvent = String(tableName || '').toLowerCase() === 'sets' || action.toUpperCase() === 'SYNC_SET_TO_GLIDE';
    if (isSetsEvent) {
      if (String(data.token || '') !== 'TEMP_CREATE_SETS_TOKEN_20260101') {
        return ContentService.createTextOutput(JSON.stringify({status: 'error', msg: 'token required'})).setMimeType(ContentService.MimeType.JSON);
      }
      const glideId = String(
        (rowLower['glidewodid'] || rowLower['glideid'] || readAnyField_(data, ['glideId', 'glide_wod_id', 'Glide_Wod_ID']) || '')
      ).trim();
      const setNumber = parseInt(rowLower['setnumber'] || rowLower['set'] || readAnyField_(data, ['setNumber', 'set_number', 'SetNumber']) || '', 10);
      const reps = rowLower['reps'] != null ? rowLower['reps'] : (readAnyField_(data, ['reps', 'Reps']) != null ? readAnyField_(data, ['reps', 'Reps']) : '');
      const load = rowLower['load'] != null ? rowLower['load'] : (readAnyField_(data, ['load', 'Load']) != null ? readAnyField_(data, ['load', 'Load']) : '');
      const result = syncSingleSetToGlideWod_(glideId, setNumber, reps, load);
      return ContentService.createTextOutput(JSON.stringify({status: 'ok', synced: true, result: result}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 2) When a Glide_Wod row is marked done in AppSheet, append History rows and update Recovery.
    // Recommended body:
    // { action:"GLIDE_WOD_DONE", token, Row:{ ID:"...", Is_Done:true, UserEmail:"..." } }
    // Or AppSheet standard-ish:
    // { TableName:"Glide_Wod", EventType:"UPDATE", token, Row:{...} }
    const isGlideEvent = String(tableName || '').toLowerCase() === String(SHEET_GLIDE || 'Glide_Wod').toLowerCase() || action.toUpperCase() === 'GLIDE_WOD_DONE';
    if (isGlideEvent) {
      if (String(data.token || '') !== 'TEMP_CREATE_SETS_TOKEN_20260101') {
        return ContentService.createTextOutput(JSON.stringify({status: 'error', msg: 'token required'})).setMimeType(ContentService.MimeType.JSON);
      }
      const glideId = String(rowLower['id'] || rowLower['glidewodid'] || readAnyField_(data, ['glideId', 'id', 'ID', 'Glide_Wod_ID']) || '').trim();
      const doneVal = rowLower['isdone'] != null ? rowLower['isdone'] : (rowLower['done'] != null ? rowLower['done'] : (readAnyField_(data, ['is_done', 'Is_Done', 'done', 'Done']) != null ? readAnyField_(data, ['is_done', 'Is_Done', 'done', 'Done']) : undefined));
      const isDone = String(doneVal).toLowerCase() === 'true' || String(doneVal) === '1' || doneVal === true;
      const userEmail = String(readAnyField_(data, ['UserEmail','userEmail','Email','email']) || explicitEmail || rowEmail || actorEmail || '').trim();
      const doneResult = isDone ? completeGlideWodToHistory_(glideId, userEmail) : setGlideWodDoneState_(glideId, false, userEmail);
      return ContentService.createTextOutput(JSON.stringify({status: 'ok', completed: isDone, result: doneResult}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // AppSheet webhook: replace exercise for a Set (uses SetsHelpers.gs logic)
    if (data.action === "REPLACE_SET_EXERCISE" && data.token === "TEMP_CREATE_SETS_TOKEN_20260101") {
      const result = handleReplaceFromPost(data);
      return ContentService.createTextOutput(JSON.stringify({status: "ok", result: result})).setMimeType(ContentService.MimeType.JSON);
    }

    // AppSheet webhook: replace exercise for a Glide_Wod row
    // Expected: {action:"REPLACE_GLIDE_EXERCISE", token, glideId, equipment?, muscle?, exerciseId?}
    if (data.action === "REPLACE_GLIDE_EXERCISE" && data.token === "TEMP_CREATE_SETS_TOKEN_20260101") {
      const result = replaceGlideWodExercise_(data);
      return ContentService.createTextOutput(JSON.stringify({status: "ok", result: result})).setMimeType(ContentService.MimeType.JSON);
    }

    // Per-set completion: append a single set entry to History
    // Expected: { action:"SET_DONE", token, Row:{ Glide_Wod_ID:"...", SetNumber:1, Reps:10, Load:50, UserEmail:"..." } }
    if (data.action === "SET_DONE" && data.token === "TEMP_CREATE_SETS_TOKEN_20260101") {
      const rowLower2 = {};
      const rowObj2 = (data && (data.Row || data.row || data.Values || data.values)) ? (data.Row || data.row || data.Values || data.values) : null;
      if (rowObj2 && typeof rowObj2 === 'object') {
        Object.keys(rowObj2).forEach((k) => { rowLower2[normalizeKey_(k)] = rowObj2[k]; });
      }
      const glideId = String(readAnyField_(rowObj2, ['Glide_Wod_ID','glide_wod_id','GlideId','glideId','ID','id']) || '').trim();
      const setNumber = parseInt(readAnyField_(rowObj2, ['SetNumber','set_number','set']) || '', 10);
      const reps = readAnyField_(rowObj2, ['Reps','reps']) != null ? readAnyField_(rowObj2, ['Reps','reps']) : '';
      const load = readAnyField_(rowObj2, ['Load','load']) != null ? readAnyField_(rowObj2, ['Load','load']) : '';
      const userEmail = String(readAnyField_(rowObj2, ['UserEmail','userEmail','Email','email']) || actorEmail || '').trim();
      const result = appendSingleSetToHistory_(glideId, setNumber, reps, load, userEmail);
      return ContentService.createTextOutput(JSON.stringify({status: "ok", result: result})).setMimeType(ContentService.MimeType.JSON);
    }

    // Ensure a UserProfile row exists for a given email; append if missing
    // Expected: { action:"ENSURE_USER_PROFILE", token, userEmail:"..." }
    if (data.action === "ENSURE_USER_PROFILE" && data.token === "TEMP_CREATE_SETS_TOKEN_20260101") {
      const targetEmail = String(explicitEmail || rowEmail || actorEmail || '').trim();
      if (!targetEmail) {
        return ContentService.createTextOutput(JSON.stringify({status: 'error', msg: 'missing email'}))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const ssE = SpreadsheetApp.getActiveSpreadsheet();
      const shGenE = ssE.getSheetByName(SHEET_GEN);
      if (!shGenE) {
        return ContentService.createTextOutput(JSON.stringify({status: 'error', msg: 'UserProfile missing'}))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const dataE = shGenE.getDataRange().getValues();
      const headersE = (dataE && dataE[0]) ? dataE[0].map(h => String(h || '').trim()) : [];
      let emailIdxE = idxOfAny_(headersE, ['UserEmail', 'Email', 'E-mail', 'Mail']);
      if (emailIdxE === -1) emailIdxE = 1; // legacy fallback
      const wantedE = targetEmail.toLowerCase();
      let rowNumE = -1;
      for (let r = 1; r < dataE.length; r++) {
        const v = String(dataE[r][emailIdxE] || '').trim().toLowerCase();
        if (v && v === wantedE) { rowNumE = r + 1; break; }
      }
      if (rowNumE !== -1) {
        return ContentService.createTextOutput(JSON.stringify({status: 'ok', existed: true, email: targetEmail}))
          .setMimeType(ContentService.MimeType.JSON);
      }
      // Append row with email set, other cells blank
      const lastColE = shGenE.getLastColumn();
      const newRow = new Array(Math.max(1, lastColE)).fill('');
      newRow[emailIdxE] = targetEmail;
      shGenE.appendRow(newRow);
      return ContentService.createTextOutput(JSON.stringify({status: 'ok', created: true, email: targetEmail}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Setup (POST): allow writing Durée/DUREE minutes redundantly via Row payload.
    // Expected: { action:"SET_USER_SETUP", token, Row:{ UserEmail:"...", DUREE:30 } }
    if (data.action === "SET_USER_SETUP" && data.token === "TEMP_CREATE_SETS_TOKEN_20260101") {
      const rowObj3 = (data && (data.Row || data.row || data.Values || data.values)) ? (data.Row || data.row || data.Values || data.values) : null;
      const email3 = String(readAnyField_(rowObj3, ['UserEmail','userEmail','Email','email']) || explicitEmail || rowEmail || actorEmail || '').trim();
      if (!email3) {
        return ContentService.createTextOutput(JSON.stringify({status: 'error', msg: 'missing email'}))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const ss3 = SpreadsheetApp.getActiveSpreadsheet();
      const shGen3 = ss3.getSheetByName(SHEET_GEN);
      if (!shGen3) {
        return ContentService.createTextOutput(JSON.stringify({status: 'error', msg: 'UserProfile missing'}))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const prof3 = getUserProfileConfig_(shGen3, email3);
      if (!prof3 || !prof3.indices) {
        return ContentService.createTextOutput(JSON.stringify({status: 'error', msg: 'profile not found'}))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const data3 = shGen3.getDataRange().getValues();
      const emailIdx3 = prof3.indices.emailIdx != null ? prof3.indices.emailIdx : 1;
      const target3 = email3.toLowerCase();
      let rowNum3 = -1;
      for (let r = 1; r < data3.length; r++) {
        const v = String(data3[r][emailIdx3] || '').trim().toLowerCase();
        if (v && v === target3) { rowNum3 = r + 1; break; }
      }
      if (rowNum3 === -1) {
        return ContentService.createTextOutput(JSON.stringify({status: 'error', msg: 'user not found'}))
          .setMimeType(ContentService.MimeType.JSON);
      }

      // Pick minutes from multiple possible keys in Row
      const minutes3Raw = readAnyField_(rowObj3, ['DUREE','Durée','duree','Minutes','minutes','durationMin','Duration','duration']);
      const minutes3 = parseInt(minutes3Raw, 10);
      if (prof3.indices.hiitMinutesIdx != null && prof3.indices.hiitMinutesIdx >= 0 && !isNaN(minutes3)) {
        shGen3.getRange(rowNum3, prof3.indices.hiitMinutesIdx + 1).setValue(minutes3);
      }
      // Explicit fallback: also write to absolute column H (8) for Durée
      if (!isNaN(minutes3)) {
        try { shGen3.getRange(rowNum3, 8).setValue(minutes3); } catch (e) {}
      }
      return ContentService.createTextOutput(JSON.stringify({status: 'ok', email: email3, minutes: isNaN(minutes3) ? null : minutes3}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({status: "ignored"}));
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({status: "error", msg: err.toString()}));
  }
}

function syncSingleSetToGlideWod_(glideId, setNumber, reps, load) {
  const gid = String(glideId || '').trim();
  const sNum = parseInt(setNumber, 10);
  if (!gid) return {status: 'error', msg: 'missing glideId'};
  if (![1, 2, 3].includes(sNum)) return {status: 'error', msg: 'invalid setNumber', setNumber: setNumber};

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureGlideWodSchema_();
  const sh = ss.getSheetByName(SHEET_GLIDE);
  if (!sh) return {status: 'error', msg: 'Glide_Wod missing'};

  const data = sh.getDataRange().getValues();
  if (data.length < 2) return {status: 'error', msg: 'Glide_Wod empty'};
  const headers = data[0].map(h => String(h || '').trim());
  const lower = headers.map(h => h.toLowerCase());
  const idIdx = lower.indexOf('id');
  if (idIdx === -1) return {status: 'error', msg: 'Glide_Wod missing ID'};

  const repsIdx = lower.indexOf(('set' + sNum + '_reps').toLowerCase());
  const loadIdx = lower.indexOf(('set' + sNum + '_load').toLowerCase());
  if (repsIdx === -1 || loadIdx === -1) return {status: 'error', msg: 'Glide_Wod missing set columns', setNumber: sNum};

  let rowNum = -1;
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][idIdx] || '').trim() === gid) { rowNum = r + 1; break; }
  }
  if (rowNum === -1) return {status: 'error', msg: 'glideId not found', glideId: gid};

  sh.getRange(rowNum, repsIdx + 1).setValue(reps != null ? reps : '');
  sh.getRange(rowNum, loadIdx + 1).setValue(load != null ? load : '');
  return {status: 'ok', glideId: gid, setNumber: sNum};
}

function completeGlideWodToHistory_(glideId, fallbackUserEmail) {
  const gid = String(glideId || '').trim();
  if (!gid) return {status: 'error', msg: 'missing glideId'};

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureGlideWodSchema_();
  const shGlide = ss.getSheetByName(SHEET_GLIDE);
  if (!shGlide) return {status: 'error', msg: 'Glide_Wod missing'};

  let shHist = ss.getSheetByName(SHEET_HIST);
  if (!shHist) {
    shHist = ss.insertSheet(SHEET_HIST);
    shHist.appendRow(["Date", "Type", "Category", "Muscles", "Exercice", "Equip", "Reps", "Load", "Video", "Done", "UserEmail"]);
  }

  const data = shGlide.getDataRange().getValues();
  if (data.length < 2) return {status: 'error', msg: 'Glide_Wod empty'};
  const headers = data[0].map(h => String(h || '').trim());
  const lower = headers.map(h => h.toLowerCase());
  const idIdx = lower.indexOf('id');
  const userIdx = lower.indexOf('useremail');
  const catIdx = lower.indexOf('category');
  const musIdx = lower.indexOf('muscles');
  const exIdx = lower.indexOf('exercise');
  const eqIdx = lower.indexOf('equipment');
  const videoIdx = lower.indexOf('video_url');
  const repsTextIdx = lower.indexOf('reps_text');
  const weightIdx = lower.indexOf('weight_sugg');
  const s1rIdx = lower.indexOf('set1_reps');
  const s1wIdx = lower.indexOf('set1_load');
  const s2rIdx = lower.indexOf('set2_reps');
  const s2wIdx = lower.indexOf('set2_load');
  const s3rIdx = lower.indexOf('set3_reps');
  const s3wIdx = lower.indexOf('set3_load');

  if (idIdx === -1) return {status: 'error', msg: 'Glide_Wod missing ID'};
  let row = null;
  let rowNum = -1;
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][idIdx] || '').trim() === gid) { row = data[r]; rowNum = r + 1; break; }
  }
  if (!row) return {status: 'error', msg: 'glideId not found', glideId: gid};

  const userEmail = String((userIdx !== -1 ? row[userIdx] : '') || fallbackUserEmail || '').trim();
  const category = String(catIdx !== -1 ? row[catIdx] : '').trim();
  const muscles = String(musIdx !== -1 ? row[musIdx] : '').trim();
  const exercise = String(exIdx !== -1 ? row[exIdx] : '').trim();
  const equip = String(eqIdx !== -1 ? row[eqIdx] : '').trim();
  const video = String(videoIdx !== -1 ? row[videoIdx] : '').trim();
  const repsText = String(repsTextIdx !== -1 ? row[repsTextIdx] : '').trim();
  const weightSugg = String(weightIdx !== -1 ? row[weightIdx] : '').trim();

  const sets = [
    {r: (s1rIdx !== -1 ? row[s1rIdx] : ''), w: (s1wIdx !== -1 ? row[s1wIdx] : '')},
    {r: (s2rIdx !== -1 ? row[s2rIdx] : ''), w: (s2wIdx !== -1 ? row[s2wIdx] : '')},
    {r: (s3rIdx !== -1 ? row[s3rIdx] : ''), w: (s3wIdx !== -1 ? row[s3wIdx] : '')}
  ];

  const now = new Date();
  let appended = 0;
  sets.forEach((s) => {
    const has = (s.r !== '' && s.r != null) || (s.w !== '' && s.w != null);
    if (!has) return;
    shHist.appendRow([now, 'AppSheet', category, muscles, exercise, equip, s.r, s.w, video, true, userEmail]);
    appended++;
  });

  if (appended === 0) {
    shHist.appendRow([now, 'AppSheet', category, muscles, exercise, equip, repsText, weightSugg, video, true, userEmail]);
    appended = 1;
  }

  try { updateRecoveryDashboard(userEmail); } catch (e) {}
  // Persist canonical done state on the Glide_Wod row so summaries reflect completion
  try {
    const doneIdx = lower.indexOf('is_done');
    if (rowNum !== -1 && doneIdx !== -1) {
      shGlide.getRange(rowNum, doneIdx + 1).setValue(true);
    }
    if (rowNum !== -1 && userIdx !== -1 && userEmail) {
      shGlide.getRange(rowNum, userIdx + 1).setValue(userEmail);
    }
    SpreadsheetApp.flush();
  } catch (e) {}
  return {status: 'ok', glideId: gid, historyRows: appended, userEmail: userEmail};
}

// Set or clear the Is_Done flag on a Glide_Wod row (used for UNDO operations)
function setGlideWodDoneState_(glideId, isDone, fallbackUserEmail) {
  const gid = String(glideId || '').trim();
  if (!gid) return {status: 'error', msg: 'missing glideId'};
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureGlideWodSchema_();
  const shGlide = ss.getSheetByName(SHEET_GLIDE);
  if (!shGlide) return {status: 'error', msg: 'Glide_Wod missing'};

  const data = shGlide.getDataRange().getValues();
  if (data.length < 2) return {status: 'error', msg: 'Glide_Wod empty'};
  const headers = data[0].map(h => String(h || '').trim());
  const lower = headers.map(h => h.toLowerCase());
  const idIdx = lower.indexOf('id');
  const userIdx = lower.indexOf('useremail');
  const doneIdx = lower.indexOf('is_done');
  if (idIdx === -1) return {status: 'error', msg: 'Glide_Wod missing ID'};

  let rowNum = -1;
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][idIdx] || '').trim() === gid) { rowNum = r + 1; break; }
  }
  if (rowNum === -1) return {status: 'error', msg: 'glideId not found', glideId: gid};

  try {
    if (doneIdx !== -1) {
      shGlide.getRange(rowNum, doneIdx + 1).setValue(isDone ? true : false);
    }
    if (userIdx !== -1 && fallbackUserEmail) {
      shGlide.getRange(rowNum, userIdx + 1).setValue(fallbackUserEmail);
    }
    SpreadsheetApp.flush();
    return {status: 'ok', glideId: gid, isDone: !!isDone};
  } catch (e) {
    return {status: 'error', msg: String(e)};
  }
}

function appendSingleSetToHistory_(glideId, setNumber, reps, load, fallbackUserEmail) {
  const gid = String(glideId || '').trim();
  const sNum = parseInt(setNumber, 10);
  if (!gid) return {status: 'error', msg: 'missing glideId'};
  if (![1,2,3].includes(sNum)) return {status: 'error', msg: 'invalid setNumber'};

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureGlideWodSchema_();
  const shGlide = ss.getSheetByName(SHEET_GLIDE);
  if (!shGlide) return {status: 'error', msg: 'Glide_Wod missing'};

  let shHist = ss.getSheetByName(SHEET_HIST);
  if (!shHist) {
    shHist = ss.insertSheet(SHEET_HIST);
    shHist.appendRow(["Date", "Type", "Category", "Muscles", "Exercice", "Equip", "Reps", "Load", "Video", "Done", "UserEmail"]);
  }

  const data = shGlide.getDataRange().getValues();
  if (data.length < 2) return {status: 'error', msg: 'Glide_Wod empty'};
  const headers = data[0].map(h => String(h || '').trim());
  const lower = headers.map(h => h.toLowerCase());
  const idIdx = lower.indexOf('id');
  const userIdx = lower.indexOf('useremail');
  const catIdx = lower.indexOf('category');
  const musIdx = lower.indexOf('muscles');
  const exIdx = lower.indexOf('exercise');
  const eqIdx = lower.indexOf('equipment');
  const videoIdx = lower.indexOf('video_url');
  const repsIdx = sNum === 1 ? lower.indexOf('set1_reps') : (sNum === 2 ? lower.indexOf('set2_reps') : lower.indexOf('set3_reps'));
  const loadIdx = sNum === 1 ? lower.indexOf('set1_load') : (sNum === 2 ? lower.indexOf('set2_load') : lower.indexOf('set3_load'));

  if (idIdx === -1) return {status: 'error', msg: 'Glide_Wod missing ID'};
  let row = null;
  let rowNum = -1;
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][idIdx] || '').trim() === gid) { row = data[r]; rowNum = r + 1; break; }
  }
  if (!row) return {status: 'error', msg: 'glideId not found', glideId: gid};

  const userEmail = String((userIdx !== -1 ? row[userIdx] : '') || fallbackUserEmail || '').trim();
  const category = String(catIdx !== -1 ? row[catIdx] : '').trim();
  const muscles = String(musIdx !== -1 ? row[musIdx] : '').trim();
  const exercise = String(exIdx !== -1 ? row[exIdx] : '').trim();
  const equip = String(eqIdx !== -1 ? row[eqIdx] : '').trim();
  const video = String(videoIdx !== -1 ? row[videoIdx] : '').trim();

  const now = new Date();
  const finalReps = (reps != null && String(reps).trim() !== '') ? reps : (repsIdx !== -1 ? row[repsIdx] : '');
  const finalLoad = (load != null && String(load).trim() !== '') ? load : (loadIdx !== -1 ? row[loadIdx] : '');
  shHist.appendRow([now, 'AppSheet', category, muscles, exercise, equip, finalReps, finalLoad, video, true, userEmail]);

  // Also persist reps/load back into Glide if values provided explicitly
  if (rowNum !== -1) {
    if (reps != null && repsIdx !== -1) shGlide.getRange(rowNum, repsIdx + 1).setValue(reps);
    if (load != null && loadIdx !== -1) shGlide.getRange(rowNum, loadIdx + 1).setValue(load);
  }

  try { updateRecoveryDashboard(userEmail); } catch (e) {}
  return {status: 'ok', glideId: gid, setNumber: sNum, userEmail: userEmail};
}

// Temporary, token-protected GET endpoint to trigger safe operations (one-shot use)
function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const actionTrim = String(params.action || '').trim();
    const actionUp = actionTrim.toUpperCase();
    const tokenTrim = String(params.token || '').trim();
    const tokenOk = tokenTrim === 'TEMP_CREATE_SETS_TOKEN_20260101';

    const rawPage = String(params.page || '');
    const page = rawPage.trim().toLowerCase();
    const pageCompact = page.replace(/[^a-z0-9]/g, '');

    // Default UI: if opened as a normal link (no action/token), show the timer.
    // This makes it easy to open from AppSheet with a simple /exec URL.
    const hasAction = params.action != null && String(params.action).trim() !== '';
    const hasToken = params.token != null && String(params.token).trim() !== '';
    const hasPage = rawPage.trim() !== '';
    if (!hasPage && !hasAction && !hasToken) {
      return HtmlService
        .createHtmlOutputFromFile('Timer')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    // Public UI route: open Timer.html in a webview (for AppSheet or browser)
    if (page === 'timer') {
      return HtmlService
        .createHtmlOutputFromFile('Timer')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    // Public UI route: open TimerHIIT.html (dedicated HIIT timer page)
    if (page === 'timerhiit' || pageCompact === 'timerhiit') {
      return HtmlService
        .createHtmlOutputFromFile('TimerHIIT')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    if (params.action === 'DEBUG_PROFILE' && params.token === 'TEMP_CREATE_SETS_TOKEN_20260101') {
      const email = String(params.email || '').trim();
      if (!email) {
        return ContentService.createTextOutput(JSON.stringify({status: 'error', msg: 'missing email'}))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const shGen = ss.getSheetByName(SHEET_GEN);
      if (!shGen) {
        return ContentService.createTextOutput(JSON.stringify({status: 'error', msg: 'UserProfile missing'}))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const data = shGen.getDataRange().getValues();
      const headers = (data && data[0]) ? data[0].map(h => String(h || '').trim()) : [];
      const profile = getUserProfileConfig_(shGen, email);
      const idx = (profile && profile.indices) ? profile.indices : {};
      const pick = (i) => (i != null && i >= 0 && i < headers.length) ? headers[i] : null;
      return ContentService.createTextOutput(JSON.stringify({
        status: 'ok',
        email: email,
        selectedType: profile.selectedType,
        programType: profile.programType,
        targetCount: profile.targetCount,
        setCount: profile.setCount,
        alias: profile.alias,
        hiit: profile.hiit,
        indices: idx,
        headersAtIndices: {
          email: pick(idx.emailIdx),
          selectedType: pick(idx.selectedTypeIdx),
          programType: pick(idx.programTypeIdx),
          equipment: pick(idx.equipIdx),
          alias: pick(idx.aliasIdx),
          targetCount: pick(idx.targetCountIdx),
          setCount: pick(idx.setCountIdx),
          hiitMinutes: pick(idx.hiitMinutesIdx),
          hiitWork: pick(idx.hiitWorkIdx),
          hiitRest: pick(idx.hiitRestIdx)
        }
      }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Ensure a UserProfile row exists (GET variant for easier testing)
    if (params.action === 'ENSURE_USER_PROFILE' && params.token === 'TEMP_CREATE_SETS_TOKEN_20260101') {
      const email = String(params.email || '').trim();
      if (!email) {
        return ContentService.createTextOutput(JSON.stringify({status: 'error', msg: 'missing email'}))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const shGen = ss.getSheetByName(SHEET_GEN);
      if (!shGen) {
        return ContentService.createTextOutput(JSON.stringify({status: 'error', msg: 'UserProfile missing'}))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const data = shGen.getDataRange().getValues();
      const headers = (data && data[0]) ? data[0].map(h => String(h || '').trim()) : [];
      let emailIdx = idxOfAny_(headers, ['UserEmail', 'Email', 'E-mail', 'Mail']);
      if (emailIdx === -1) emailIdx = 1;
      const wanted = email.toLowerCase();
      for (let r = 1; r < data.length; r++) {
        const v = String(data[r][emailIdx] || '').trim().toLowerCase();
        if (v && v === wanted) {
          return ContentService.createTextOutput(JSON.stringify({status: 'ok', existed: true, email: email}))
            .setMimeType(ContentService.MimeType.JSON);
        }
      }
      const lastCol = shGen.getLastColumn();
      const newRow = new Array(Math.max(1, lastCol)).fill('');
      newRow[emailIdx] = email;
      shGen.appendRow(newRow);
      return ContentService.createTextOutput(JSON.stringify({status: 'ok', created: true, email: email}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Debug: return the raw UserProfile row for an email (headers + values)
    if (params.action === 'DUMP_USERPROFILE_ROW' && params.token === 'TEMP_CREATE_SETS_TOKEN_20260101') {
      const email = String(params.email || '').trim();
      if (!email) {
        return ContentService.createTextOutput(JSON.stringify({status: 'error', msg: 'missing email'}))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const shGen = ss.getSheetByName(SHEET_GEN);
      if (!shGen) {
        return ContentService.createTextOutput(JSON.stringify({status: 'error', msg: 'UserProfile missing'}))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const data = shGen.getDataRange().getValues();
      if (!data || data.length < 2) {
        return ContentService.createTextOutput(JSON.stringify({status: 'ok', email: email, headers: [], row: null}))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const headers = data[0].map(h => String(h || '').trim());
      const lower = headers.map(h => String(h || '').toLowerCase());
      const emailIdx = lower.indexOf('email') !== -1 ? lower.indexOf('email') : 1;

      const emailNorm = String(email).trim().toLowerCase();
      let found = null;
      for (let r = 1; r < data.length; r++) {
        let v = String(data[r][emailIdx] || '').trim().toLowerCase();
        if (!v) {
          // Fallback: search entire row for the email value
          for (let c = 0; c < data[r].length; c++) {
            const cell = String(data[r][c] || '').trim().toLowerCase();
            if (cell && cell === emailNorm) { found = data[r]; break; }
          }
          if (found) break;
        }
        if (v && v === emailNorm) { found = data[r]; break; }
      }
      return ContentService.createTextOutput(JSON.stringify({status: 'ok', email: email, headers: headers, row: found}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Debug: summarize Glide_Wod rows for a given email (counts + sample rows)
    if (params.action === 'GLIDE_WOD_SUMMARY' && params.token === 'TEMP_CREATE_SETS_TOKEN_20260101') {
      const email = String(params.email || '').trim();
      if (!email) {
        return ContentService.createTextOutput(JSON.stringify({status: 'error', msg: 'missing email'}))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      ensureGlideWodSchema_();
      const sh = ss.getSheetByName(SHEET_GLIDE);
      if (!sh) {
        return ContentService.createTextOutput(JSON.stringify({status: 'error', msg: 'Glide_Wod missing'}))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const data = sh.getDataRange().getValues();
      if (!data || data.length < 2) {
        return ContentService.createTextOutput(JSON.stringify({status: 'ok', email: email, totalRows: 0, headers: [], sample: []}))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const headers = data[0].map(h => String(h || '').trim());
      const lower = headers.map(h => String(h || '').toLowerCase());
      const userIdx = lower.indexOf('useremail');
      const orderIdx = lower.indexOf('order');
      const exIdx = lower.indexOf('exercise');
      const exIdIdx = lower.indexOf('exercise_id');
      const doneIdx = lower.indexOf('is_done');
      const replaceIdx = lower.indexOf('doreplace');
      const idIdx = lower.indexOf('id');

      const emailNorm = String(email).trim().toLowerCase();
      const rows = [];
      for (let r = 1; r < data.length; r++) {
        const u = userIdx !== -1 ? String(data[r][userIdx] || '').trim().toLowerCase() : '';
        if (!u || u !== emailNorm) continue;
        rows.push(data[r]);
      }

      // Sort by Order if present
      if (orderIdx !== -1) {
        rows.sort((a, b) => {
          const av = parseFloat(a[orderIdx]);
          const bv = parseFloat(b[orderIdx]);
          if (isNaN(av) && isNaN(bv)) return 0;
          if (isNaN(av)) return 1;
          if (isNaN(bv)) return -1;
          return av - bv;
        });
      }

      const uniqueOrders = {};
      const uniqueExercises = {};
      rows.forEach((row) => {
        const o = orderIdx !== -1 ? String(row[orderIdx] || '').trim() : '';
        if (o) uniqueOrders[o] = true;
        const eid = exIdIdx !== -1 ? String(row[exIdIdx] || '').trim() : '';
        const en = exIdx !== -1 ? String(row[exIdx] || '').trim() : '';
        const key = eid || en;
        if (key) uniqueExercises[key] = true;
      });

      const sampleLimit = Math.min(60, rows.length);
      const sample = [];
      for (let i = 0; i < sampleLimit; i++) {
        const row = rows[i];
        sample.push({
          id: idIdx !== -1 ? row[idIdx] : null,
          order: orderIdx !== -1 ? row[orderIdx] : null,
          exercise: exIdx !== -1 ? row[exIdx] : null,
          exercise_id: exIdIdx !== -1 ? row[exIdIdx] : null,
          equipment: lower.indexOf('equipment') !== -1 ? row[lower.indexOf('equipment')] : null,
          muscles: lower.indexOf('muscles') !== -1 ? row[lower.indexOf('muscles')] : null,
          reps_text: lower.indexOf('reps_text') !== -1 ? row[lower.indexOf('reps_text')] : null,
          video_url: lower.indexOf('video_url') !== -1 ? row[lower.indexOf('video_url')] : null,
          set1_reps: lower.indexOf('set1_reps') !== -1 ? row[lower.indexOf('set1_reps')] : null,
          set1_load: lower.indexOf('set1_load') !== -1 ? row[lower.indexOf('set1_load')] : null,
          set2_reps: lower.indexOf('set2_reps') !== -1 ? row[lower.indexOf('set2_reps')] : null,
          set2_load: lower.indexOf('set2_load') !== -1 ? row[lower.indexOf('set2_load')] : null,
          set3_reps: lower.indexOf('set3_reps') !== -1 ? row[lower.indexOf('set3_reps')] : null,
          set3_load: lower.indexOf('set3_load') !== -1 ? row[lower.indexOf('set3_load')] : null,
          is_done: doneIdx !== -1 ? row[doneIdx] : null,
          doreplace: replaceIdx !== -1 ? row[replaceIdx] : null
        });
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: 'ok',
        email: email,
        totalRows: rows.length,
        uniqueOrderCount: Object.keys(uniqueOrders).length,
        uniqueExerciseCount: Object.keys(uniqueExercises).length,
        headers: headers,
        sample: sample
      }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Setup: set equipment preference for a user in UserProfile (token-gated)
    if (actionUp === 'SET_USER_EQUIPMENT' && tokenOk) {
      const email = String(params.email || '').trim();
      const equipment = String(params.equipment || '').trim();
      if (!email || !equipment) {
        return ContentService.createTextOutput(JSON.stringify({status: 'error', msg: 'missing email or equipment'}))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const shGen = ss.getSheetByName(SHEET_GEN);
      if (!shGen) {
        return ContentService.createTextOutput(JSON.stringify({status: 'error', msg: 'UserProfile missing'}))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const prof = getUserProfileConfig_(shGen, email);
      if (prof && prof.indices && prof.indices.equipIdx != null && prof.indices.equipIdx >= 0) {
        // Find row for email
        const data = shGen.getDataRange().getValues();
        const emailIdx = prof.indices.emailIdx != null ? prof.indices.emailIdx : 1;
        const target = email.toLowerCase();
        let rowNum = -1;
        for (let r = 1; r < data.length; r++) {
          const v = String(data[r][emailIdx] || '').trim().toLowerCase();
          if (v && v === target) { rowNum = r + 1; break; }
        }
        if (rowNum !== -1) {
          shGen.getRange(rowNum, prof.indices.equipIdx + 1).setValue(equipment);
          return ContentService.createTextOutput(JSON.stringify({status: 'ok', email: email, equipment: equipment}))
            .setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({status: 'error', msg: 'user not found or equipment column missing'}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Setup: bulk save key profile fields (programType, selectedType, setCount, duration)
    if (actionUp === 'SET_USER_SETUP' && tokenOk) {
      const email = String(params.email || '').trim();
      const programType = String(params.programType || params.program || '').trim();
      const selectedType = String(params.selectedType || params.sessionType || '').trim();
      const setCountRaw = String(params.setCount || '').trim();
      const durationRaw = String(params.durationMin || params.duration || '').trim();
      const hiitWorkRaw = String(params.hiitWork || '').trim();
      const hiitRestRaw = String(params.hiitRest || '').trim();
      if (!email) {
        return ContentService.createTextOutput(JSON.stringify({status: 'error', msg: 'missing email'}))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const shGen = ss.getSheetByName(SHEET_GEN);
      if (!shGen) {
        return ContentService.createTextOutput(JSON.stringify({status: 'error', msg: 'UserProfile missing'}))
          .setMimeType(ContentService.MimeType.JSON);
      }
      let prof = getUserProfileConfig_(shGen, email);
      const data = shGen.getDataRange().getValues();
      const headers = (data && data[0]) ? data[0].map(h => String(h || '').trim()) : [];
      const headersLower = headers.map(h => String(h || '').trim().toLowerCase());
      let emailIdx = (prof && prof.indices && prof.indices.emailIdx != null) ? prof.indices.emailIdx : idxOfAny_(headers, ['UserEmail', 'Email', 'E-mail', 'Mail']);
      if (emailIdx === -1) emailIdx = 1;
      const target = email.toLowerCase();
      let rowNum = -1;
      for (let r = 1; r < data.length; r++) {
        const v = String(data[r][emailIdx] || '').trim().toLowerCase();
        if (v && v === target) { rowNum = r + 1; break; }
      }
      if (rowNum === -1) {
        // Profile missing: create a new UserProfile row for this email and continue
        const lastColN = shGen.getLastColumn();
        const newRowN = new Array(Math.max(1, lastColN)).fill('');
        newRowN[emailIdx] = target;
        shGen.appendRow(newRowN);
        const newLastRow = shGen.getLastRow();
        rowNum = newLastRow;
        // Refresh profile indices after creation
        prof = getUserProfileConfig_(shGen, email);
      }

      const idx = (prof && prof.indices) ? prof.indices : {
        programTypeIdx: idxOfAny_(headers, ['ProgramType','WorkoutType','Workout Type','Discipline','Mode','Type_Programme','Type Programme']),
        selectedTypeIdx: idxOfAny_(headers, ['SelectedType','SessionType','Type_Séance','Type Seance','Type_scéance_Voulue','Type_séance_Voulue','Séance','Seance','Programme','Program','Type']),
        setCountIdx: idxOfAny_(headers, ['SetCount','Set Count','Sets','Nb_Sets']),
        targetCountIdx: idxOfAny_(headers, ['TargetCount','Target Count','Exercises','ExerciseCount','Nb_Exercices','Count']),
        hiitMinutesIdx: idxOfAny_(headers, ['HIIT_Minutes','HIIT Minutes','HIIT_Duration','HIIT Duration','DurationMinutes','Duration Minutes','Minutes','Durée','Duree','DUREE','DURÉE'])
      };
      function setIf(idx1, val) { if (idx1 != null && idx1 >= 0 && val !== '') shGen.getRange(rowNum, idx1 + 1).setValue(val); }

      // Persist fields
      setIf(idx.programTypeIdx, programType);
      setIf(idx.selectedTypeIdx, selectedType);

      const setCount = setCountRaw ? parseInt(setCountRaw, 10) : (prof.setCount || 3);
      setIf(idx.setCountIdx, setCount);

      const durationMin = durationRaw ? parseInt(durationRaw, 10) : null;
      // Always persist minutes into the Durée/DUREE column when available
      if (idx.hiitMinutesIdx != null && idx.hiitMinutesIdx >= 0 && durationMin) {
        shGen.getRange(rowNum, idx.hiitMinutesIdx + 1).setValue(durationMin);
      }
      // Explicit fallback: also write to absolute column H (8) for Durée
      if (durationMin) {
        try { shGen.getRange(rowNum, 8).setValue(durationMin); } catch (e) {}
      }
      // Strength: derive targetCount from duration (approx 4 minutes per exercise by default)
      if (String(programType).toLowerCase() !== 'hiit') {
        const minutesPerExercise = Math.max(3, Math.round(((setCount || 3) * 60 + 60) / 60));
        const targetCount = durationMin ? Math.max(1, Math.floor(durationMin / minutesPerExercise)) : (prof.targetCount || 8);
        setIf(idx.targetCountIdx, targetCount);
      } else {
        // HIIT: optionally accept work/rest overrides
        if (hiitWorkRaw && idx.hiitWorkIdx != null && idx.hiitWorkIdx >= 0) {
          shGen.getRange(rowNum, idx.hiitWorkIdx + 1).setValue(parseInt(hiitWorkRaw, 10));
        }
        if (hiitRestRaw && idx.hiitRestIdx != null && idx.hiitRestIdx >= 0) {
          shGen.getRange(rowNum, idx.hiitRestIdx + 1).setValue(parseInt(hiitRestRaw, 10));
        }
      }

      return ContentService.createTextOutput(JSON.stringify({status: 'ok'}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Setup: save user alias (display name)
    if (actionUp === 'SET_USER_ALIAS' && tokenOk) {
      const email = String(params.email || '').trim();
      const alias = String(params.alias || '').trim();
      if (!email) {
        return ContentService.createTextOutput(JSON.stringify({status: 'error', msg: 'missing email'}))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const shGen = ss.getSheetByName(SHEET_GEN);
      if (!shGen) {
        return ContentService.createTextOutput(JSON.stringify({status: 'error', msg: 'UserProfile missing'}))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const prof = getUserProfileConfig_(shGen, email);
      if (!prof || !prof.indices || prof.indices.aliasIdx == null || prof.indices.aliasIdx < 0) {
        return ContentService.createTextOutput(JSON.stringify({status: 'error', msg: 'alias column missing'}))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const data = shGen.getDataRange().getValues();
      const emailIdx = prof.indices.emailIdx != null ? prof.indices.emailIdx : 1;
      const target = email.toLowerCase();
      let rowNum = -1;
      for (let r = 1; r < data.length; r++) {
        const v = String(data[r][emailIdx] || '').trim().toLowerCase();
        if (v && v === target) { rowNum = r + 1; break; }
      }
      if (rowNum === -1) {
        return ContentService.createTextOutput(JSON.stringify({status: 'error', msg: 'user not found'}))
          .setMimeType(ContentService.MimeType.JSON);
      }
      shGen.getRange(rowNum, prof.indices.aliasIdx + 1).setValue(alias);
      return ContentService.createTextOutput(JSON.stringify({status: 'ok'}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Debug: summarize Glide_HIIT rows for a given email (counts + sample rows)
    if (actionUp === 'GLIDE_HIIT_SUMMARY' && tokenOk) {
      const email = String(params.email || '').trim();
      if (!email) {
        return ContentService.createTextOutput(JSON.stringify({status: 'error', msg: 'missing email'}))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      ensureGlideHiitSchema_();
      const sh = ss.getSheetByName(SHEET_HIIT);
      if (!sh) {
        return ContentService.createTextOutput(JSON.stringify({status: 'error', msg: 'Glide_HIIT missing'}))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const data = sh.getDataRange().getValues();
      if (!data || data.length < 2) {
        return ContentService.createTextOutput(JSON.stringify({status: 'ok', email: email, totalRows: 0, headers: [], sample: []}))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const headers = data[0].map(h => String(h || '').trim());
      const lower = headers.map(h => String(h || '').toLowerCase());
      const idIdx = lower.indexOf('id');
      const userIdx = lower.indexOf('useremail');
      const orderIdx = lower.indexOf('order');
      const roundIdx = lower.indexOf('round');
      const slotIdx = lower.indexOf('slot_in_round');
      const exIdx = lower.indexOf('exercise');
      const exIdIdx = lower.indexOf('exercise_id');
      const workIdx = lower.indexOf('work_s');
      const restIdx = lower.indexOf('rest_s');
      const lblIdx = lower.indexOf('interval_label');
      const videoIdx = lower.indexOf('video_url');
      const doneIdx = lower.indexOf('is_done');

      const emailNorm = String(email).trim().toLowerCase();
      const rows = [];
      for (let r = 1; r < data.length; r++) {
        const u = userIdx !== -1 ? String(data[r][userIdx] || '').trim().toLowerCase() : '';
        if (!u || u !== emailNorm) continue;
        rows.push(data[r]);
      }

      // Sort by Order, Round, Slot
      rows.sort((a, b) => {
        const ao = orderIdx !== -1 ? parseFloat(a[orderIdx]) : 0;
        const bo = orderIdx !== -1 ? parseFloat(b[orderIdx]) : 0;
        if (ao !== bo) return ao - bo;
        const ar = roundIdx !== -1 ? parseFloat(a[roundIdx]) : 0;
        const br = roundIdx !== -1 ? parseFloat(b[roundIdx]) : 0;
        if (ar !== br) return ar - br;
        const as = slotIdx !== -1 ? parseFloat(a[slotIdx]) : 0;
        const bs = slotIdx !== -1 ? parseFloat(b[slotIdx]) : 0;
        return as - bs;
      });

      const sampleLimit = Math.min(120, rows.length);
      const sample = [];
      for (let i = 0; i < sampleLimit; i++) {
        const row = rows[i];
        sample.push({
          id: idIdx !== -1 ? row[idIdx] : null,
          order: orderIdx !== -1 ? row[orderIdx] : null,
          round: roundIdx !== -1 ? row[roundIdx] : null,
          slot_in_round: slotIdx !== -1 ? row[slotIdx] : null,
          exercise: exIdx !== -1 ? row[exIdx] : null,
          exercise_id: exIdIdx !== -1 ? row[exIdIdx] : null,
          work_s: workIdx !== -1 ? row[workIdx] : null,
          rest_s: restIdx !== -1 ? row[restIdx] : null,
          interval_label: lblIdx !== -1 ? row[lblIdx] : null,
          video_url: videoIdx !== -1 ? row[videoIdx] : null,
          is_done: doneIdx !== -1 ? row[doneIdx] : null
        });
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: 'ok',
        email: email,
        totalRows: rows.length,
        headers: headers,
        sample: sample
      }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Mark a single HIIT interval done/undone by order
    if (actionUp === 'SET_HIIT_IS_DONE' && tokenOk) {
      const email = String(params.email || '').trim();
      const order = String(params.order || '').trim();
      const doneRaw = params.isDone;
      const isDone = String(doneRaw).toLowerCase() === 'true' || String(doneRaw) === '1' || doneRaw === true;
      if (!email || !order) {
        return ContentService.createTextOutput(JSON.stringify({status: 'error', msg: 'missing email/order'}))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const res = setHiitIsDone(email, parseInt(order, 10), isDone);
      return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
    }

    // Mark an entire HIIT round (set) done/undone
    if (actionUp === 'SET_HIIT_SET_DONE' && tokenOk) {
      const email = String(params.email || '').trim();
      const round = String(params.round || '').trim();
      const doneRaw = params.isDone;
      const isDone = String(doneRaw).toLowerCase() === 'true' || String(doneRaw) === '1' || doneRaw === true;
      if (!email || !round) {
        return ContentService.createTextOutput(JSON.stringify({status: 'error', msg: 'missing email/round'}))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const res = setHiitRoundDone(email, parseInt(round, 10), isDone);
      return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
    }

    if (params.action === 'DUMP_LAST_WEBHOOK' && params.token === 'TEMP_CREATE_SETS_TOKEN_20260101') {
      const props = PropertiesService.getScriptProperties();
      const at = props.getProperty('LAST_WEBHOOK_AT') || '';
      const raw = props.getProperty('LAST_WEBHOOK_RAW') || '';
      return ContentService
        .createTextOutput(JSON.stringify({status: 'ok', at: at, raw: raw}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (params.action === 'CREATE_SETS' && params.token === 'TEMP_CREATE_SETS_TOKEN_20260101') {
      const result = createSetsSheet();
      return ContentService.createTextOutput(JSON.stringify({status: 'created', result})).setMimeType(ContentService.MimeType.JSON);
    }

    if (params.action === 'DUMP_EXERCISEDB' && params.token === 'TEMP_CREATE_SETS_TOKEN_20260101') {
      const result = dumpExerciceDB(500);
      return ContentService.createTextOutput(JSON.stringify({status: 'ok', result})).setMimeType(ContentService.MimeType.JSON);
    }

    if (params.action === 'EXODB_COLUMN_STATS' && params.token === 'TEMP_CREATE_SETS_TOKEN_20260101') {
      const result = getExerciceDBColumnStats();
      return ContentService.createTextOutput(JSON.stringify({status: 'ok', result})).setMimeType(ContentService.MimeType.JSON);
    }

    if (params.action === 'ENSURE_EXODB_COLUMNS_MINIMAL' && params.token === 'TEMP_CREATE_SETS_TOKEN_20260101') {
      const result = ensureExerciceDBColumnsMinimal();
      return ContentService.createTextOutput(JSON.stringify({status: 'ok', result})).setMimeType(ContentService.MimeType.JSON);
    }

    if (params.action === 'AUDIT_EXODB_EQUIP_FATIGUE' && params.token === 'TEMP_CREATE_SETS_TOKEN_20260101') {
      const result = auditExerciceDBEquipmentFatigue(200);
      return ContentService.createTextOutput(JSON.stringify({status: 'ok', result})).setMimeType(ContentService.MimeType.JSON);
    }

    if (params.action === 'AUDIT_EXODB_FATIGUE_KEYS' && params.token === 'TEMP_CREATE_SETS_TOKEN_20260101') {
      const result = auditExerciceDBFatigueKeys(200);
      return ContentService.createTextOutput(JSON.stringify({status: 'ok', result})).setMimeType(ContentService.MimeType.JSON);
    }

    if (params.action === 'FIX_EXODB_FATIGUE_KEYS' && params.token === 'TEMP_CREATE_SETS_TOKEN_20260101') {
      const result = fixExerciceDBFatigueKeys();
      return ContentService.createTextOutput(JSON.stringify({status: 'ok', result})).setMimeType(ContentService.MimeType.JSON);
    }

    if (params.action === 'FIX_EXODB_PRIMARY_MUSCLE_KEYS' && params.token === 'TEMP_CREATE_SETS_TOKEN_20260101') {
      const result = fixExerciceDBPrimaryMuscleKeys();
      return ContentService.createTextOutput(JSON.stringify({status: 'ok', result})).setMimeType(ContentService.MimeType.JSON);
    }

    if (params.action === 'FIX_EXODB_ANKLES_TO_CALVES' && params.token === 'TEMP_CREATE_SETS_TOKEN_20260101') {
      const result = fixExerciceDBAnklesToCalves();
      return ContentService.createTextOutput(JSON.stringify({status: 'ok', result})).setMimeType(ContentService.MimeType.JSON);
    }

    if (params.action === 'UPDATE_RECOVERY_DASH' && params.token === 'TEMP_CREATE_SETS_TOKEN_20260101') {
      updateRecoveryDashboard('web');
      return ContentService.createTextOutput(JSON.stringify({status: 'ok'})).setMimeType(ContentService.MimeType.JSON);
    }

    if (params.action === 'DUMP_RECOVERY_DASH' && params.token === 'TEMP_CREATE_SETS_TOKEN_20260101') {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(SHEET_DASH);
      if (!sheet) return ContentService.createTextOutput(JSON.stringify({status: 'ok', rows: []})).setMimeType(ContentService.MimeType.JSON);
      const lastRow = sheet.getLastRow();
      const lastCol = sheet.getLastColumn();
      const lim = Math.min(100, Math.max(0, lastRow - 1));
      if (lim <= 0) return ContentService.createTextOutput(JSON.stringify({status: 'ok', headers: sheet.getRange(1,1,1,lastCol).getValues()[0], rows: []})).setMimeType(ContentService.MimeType.JSON);
      const headers = sheet.getRange(1,1,1,lastCol).getValues()[0];
      const rows = sheet.getRange(2, 1, lim, lastCol).getValues();
      return ContentService.createTextOutput(JSON.stringify({status: 'ok', headers: headers, rows: rows})).setMimeType(ContentService.MimeType.JSON);
    }

    if (params.action === 'REBUILD_GLIDE_WOD_SCHEMA' && params.token === 'TEMP_CREATE_SETS_TOKEN_20260101') {
      const result = rebuildGlideWodSchema_();
      return ContentService.createTextOutput(JSON.stringify({status: 'ok', result})).setMimeType(ContentService.MimeType.JSON);
    }

    if (params.action === 'ENSURE_GLIDE_HIIT_SCHEMA' && params.token === 'TEMP_CREATE_SETS_TOKEN_20260101') {
      const result = ensureGlideHiitSchema_();
      return ContentService.createTextOutput(JSON.stringify({status: 'ok', result})).setMimeType(ContentService.MimeType.JSON);
    }

    if (params.action === 'GENERATE_HIIT' && params.token === 'TEMP_CREATE_SETS_TOKEN_20260101') {
      const email = String(params.email || Session.getActiveUser().getEmail() || '').trim();
      generateHIITWorkout(email);
      return ContentService.createTextOutput(JSON.stringify({status: 'ok', generated: 'hiit', userEmail: email}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (params.action === 'DEDUPE_EXODB_NAMES' && params.token === 'TEMP_CREATE_SETS_TOKEN_20260101') {
      try {
        const result = dedupeExerciceDBNames();
        return ContentService.createTextOutput(JSON.stringify({status: 'ok', result})).setMimeType(ContentService.MimeType.JSON);
      } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({status:'error', msg: err.toString()})).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // One-shot, token-protected trigger to run the ExerciceDB auto-fix (conservative, adds Modified_Auto notes)
    if ((params.action === 'AUTO_FIX_EXODB' || params.action === 'APPLY_FIXES_BRIEF') && params.token === 'TEMP_CREATE_SETS_TOKEN_20260101') {
      try {
        const result = autoFixExerciceDB();
        // Return a short summary for quick runs
        const summary = {
          fixedNames: result.fixedNames ? result.fixedNames.length : 0,
          addedRows: result.addedRows ? result.addedRows.length : 0,
          equipmentFixes: result.equipmentFixes ? result.equipmentFixes.length : 0,
          categoryFixes: result.categoryFixes ? result.categoryFixes.length : 0,
          fatigueFixes: result.fatigueFixes ? result.fatigueFixes.length : 0
        };
        return ContentService.createTextOutput(JSON.stringify({status: 'ok', summary, detail: result})).setMimeType(ContentService.MimeType.JSON);
      } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({status:'error', msg: err.toString()})).setMimeType(ContentService.MimeType.JSON);
      }
    }

    if (params.action === 'FIND_TODO_AUTOADDED' && params.token === 'TEMP_CREATE_SETS_TOKEN_20260101') {
      try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const sh = ss.getSheetByName('ExerciceDB');
        if (!sh) return ContentService.createTextOutput(JSON.stringify({status:'error', msg:'ExerciceDB missing'})).setMimeType(ContentService.MimeType.JSON);
        const data = sh.getDataRange().getValues();
        const headers = data[0].map(h => String(h || '').trim());
        const lower = headers.map(h => (h||'').toLowerCase());
        const nameIdx = lower.indexOf('nom complet') !== -1 ? lower.indexOf('nom complet') : (lower.indexOf('name') !== -1 ? lower.indexOf('name') : 0);
        const idIdx = lower.indexOf('id') !== -1 ? lower.indexOf('id') : 0;
        const matches = [];
        for (let i=1;i<data.length;i++) {
          const name = String(data[i][nameIdx] || '').trim();
          if (name && name.indexOf('TODO: auto-added') === 0) matches.push({row: i+1, id: String(data[i][idIdx] || ''), name});
        }
        return ContentService.createTextOutput(JSON.stringify({status:'ok', matches})).setMimeType(ContentService.MimeType.JSON);
      } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({status:'error', msg: err.toString()})).setMimeType(ContentService.MimeType.JSON);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({status: 'ignored'})).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({status: 'error', msg: err.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}