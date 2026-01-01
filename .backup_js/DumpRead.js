function logSchemaDump(sheetId) {
  try{
    var ss = sheetId ? SpreadsheetApp.openById(sheetId) : (typeof getSs === 'function' ? getSs() : SpreadsheetApp.getActive());
    var sh = ss.getSheetByName('SchemaDump');
    if(!sh){ console.log('NO_SCHEMA_DUMP'); return {status:'no_schema'}; }
    var vals = sh.getDataRange().getValues();
    for(var i=0;i<vals.length;i++){
      console.log(JSON.stringify(vals[i]));
    }
    return {status:'ok', rows: vals.length};
  } catch(e){ console.log('ERR:'+e.message); return {status:'error', msg: e.message}; }
}
