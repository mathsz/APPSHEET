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