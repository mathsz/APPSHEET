function dumpTarget() { return dumpSheetStructure('1o0jp22IWRGJ5siqpEbNvCd5R6t-kcXaWoPVZ0kzgFPA'); }
function logTarget() { return logSchemaDump('1o0jp22IWRGJ5siqpEbNvCd5R6t-kcXaWoPVZ0kzgFPA'); }
function auditTarget() { return auditSampleRows(); }

// Safe test wrapper to move sample Glide_Wod rows to SeedData_Glide_Wod
function moveSeedGlide() {
  return moveSampleRows('Glide_Wod');
}

// Wrapper to create the Sets sheet
function createSets() {
  return createSetsSheet();
}

// Wrapper to add a test set (helpful to verify the AppSheet table mapping)
function addTestSetWrapper(glideId, setNumber, reps, load, notes) {
  return addTestSet(glideId, setNumber, reps, load, notes);
}

// Temporary helper: add a sample test set (run from Apps Script editor)
function sampleAddTestSet() {
  // Replace the Glide_Wod ID below with a real ID from your Glide_Wod sheet if needed
  const sampleGlideId = 'testuser@example.com_1';
  const setNumber = 1;
  const reps = '10';
  const load = '—';
  const notes = 'Seeded by automation agent';
  return addTestSetWrapper(sampleGlideId, setNumber, reps, load, notes);
}

// New wrappers for Sets management
function ensureSetsSchema() { return ensureSetsSchemaWrapper(); }
function applySetsDataValidation() { return applySetsDataValidationWrapper(); }
function autoAssignExercises() { return autoAssignExercisesWrapper(); }
function replaceExercise(setId) { return replaceExerciseWrapper(setId); }
function addExerciseColumn() { return addExerciseColumnIfMissingWrapper(); }
function ensureExoDbKey() { return ensureExerciceDBKey(); }
function fillExoDbIds() { return fillExerciceDBSequentialIdsWrapper(); }