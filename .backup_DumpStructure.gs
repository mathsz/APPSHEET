function dumpSheetStructure(sheetId) {
  const ss = sheetId ? SpreadsheetApp.openById(sheetId) : (typeof getSs === 'function' ? getSs() : SpreadsheetApp.getActive());
  const outName = 'SchemaDump';
  let out = ss.getSheetByName(outName);
  if (!out) out = ss.insertSheet(outName);
  out.clear();
  const sheets = ss.getSheets();
  const rows = [['SheetName','HeaderRow','SampleRow1','SampleRow2','SampleRow3']];
  sheets.forEach(s => {
    const last = s.getLastRow();
    const header = last >= 1 ? s.getRange(1,1,1,Math.max(1,s.getLastColumn())).getValues()[0].join(' | ') : '';
    const samples = [];
    for (let r=2; r<=Math.min(4,last); r++) {
      samples.push(s.getRange(r,1,1,Math.max(1,s.getLastColumn())).getValues()[0].join(' | '));
    }
    rows.push([s.getName(), header, samples[0]||'', samples[1]||'', samples[2]||'']);
  });
  out.getRange(1,1,rows.length,rows[0].length).setValues(rows);
  return {status:'ok', sheetsDumped: sheets.length};
}
