function dumpTarget() { return dumpSheetStructure('1o0jp22IWRGJ5siqpEbNvCd5R6t-kcXaWoPVZ0kzgFPA'); }
function logTarget() { return logSchemaDump('1o0jp22IWRGJ5siqpEbNvCd5R6t-kcXaWoPVZ0kzgFPA'); }
function auditTarget() { return auditSampleRows(); }

// Safe test wrapper to move sample Glide_Wod rows to SeedData_Glide_Wod
function moveSeedGlide() {
  return moveSampleRows('Glide_Wod');
}

// Wrapper to create the Sets sheet
function createSets() { return createSetsSheet(); }

// Wrapper to add a test set (helpful to verify the AppSheet table mapping)
function addTestSetWrapper(glideId, setNumber, reps, load, notes) {
  return addTestSet(glideId || '', setNumber || 1, reps || '10', load || '', notes || 'seed');
}

// Temporary helper: add a sample test set (run from Apps Script editor)
function sampleAddTestSet() {
  const sampleGlideId = 'testuser@example.com_1';
  return addTestSetWrapper(sampleGlideId, 1, '10', '—', 'Seeded by automation agent');
}

// New wrappers for Sets management
function ensureSetsSchema() { return ensureSetsSchemaWrapper(); }
function applySetsDataValidation() { return applySetsDataValidationWrapper(); }
function autoAssignExercises() { return autoAssignExercisesWrapper(); }
function replaceExercise(setId) { return replaceExerciseWrapper(setId); }
function addExerciseColumn() { return addExerciseColumnIfMissingWrapper(); }
function ensureExoDbKey() { return ensureExerciceDBKey(); }
function fillExoDbIds() { return fillExerciceDBSequentialIdsWrapper(); }
function forceFillExoDbIds() { return forceFillExerciceDBIdsWrapper(); }
function autoFixExoDb() { return autoFixExerciceDBWrapper(); }

// Top-level helper to run auto-fix via Execution API or the editor
function runAutoFixNow() { return autoFixExerciceDB(); }