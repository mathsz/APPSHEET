// FITBOOK - SCRIPT ULTIME (Version Validée - Fix Pilates Tags)

/* ===================== CONFIGURATION GLOBALE ===================== */
const SHEET_DB = "ExerciceDB";
const SHEET_GEN = "UserProfile";
const SHEET_WOD = "Wod"; 
const SHEET_HIST = "History";
const SHEET_DASH = "📊 Recovery";
const SHEET_GLIDE = "Glide_Wod"; 

const RECIPES_START_ROW = 36;
const RECIPES_ROWS = 100;

const DB_COL_NAME = 0;   
const DB_COL_ISO = 3;    
const DB_COL_EQUIP = 6;  
const DB_COL_CODE = 7;   
const DB_COL_FATIGUE = 23;

const MUSCLE_RECOVERY = {
  "Chest": 48, "Back": 48, "Legs": 72, "Shoulders": 48, 
  "Biceps": 24, "Triceps": 24, "Abs": 24, "Core": 24,
  "Quads": 72, "Hamstrings": 72, "Glutes": 72, "Calves": 48
};

/* ===================== MENU ===================== */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('FITBOOK')
    .addItem('⚡ GÉNÉRER LA SÉANCE', 'generateWorkout') 
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

function testUpdateDash() {
  updateRecoveryDashboard(Session.getActiveUser().getEmail());
}

function getSs() {
  const SS_ID = "1o0jp22IWRGJ5siqpEbNvCd5R6t-kcXaWoPVZ0kzgFPA"; 
  return SpreadsheetApp.openById(SS_ID);
}

/* ===================== GÉNÉRATEUR PRINCIPAL ===================== */
function generateWorkout(triggerEmail) {
  const targetUserEmail = (typeof triggerEmail === 'string') ? triggerEmail : Session.getActiveUser().getEmail();
  console.log(">>> Démarrage génération pour : " + targetUserEmail);

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { console.error("Serveur occupé"); return; }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shGen = ss.getSheetByName(SHEET_GEN);
  const shDb = ss.getSheetByName(SHEET_DB);
  let shGlide = ss.getSheetByName(SHEET_GLIDE);

  if (!shGen || !shDb) { lock.releaseLock(); return; }

  // 1. PROFIL
  const dataUserProfile = shGen.getDataRange().getValues();
  let userRowData = null;
  for (let i = 1; i < Math.min(dataUserProfile.length, RECIPES_START_ROW - 1); i++) {
    if (String(dataUserProfile[i][1]).trim().toLowerCase() === String(targetUserEmail).trim().toLowerCase()) {
      userRowData = dataUserProfile[i];
      break;
    }
  }

  if (!userRowData) {
    console.error("Utilisateur introuvable : " + targetUserEmail);
    lock.releaseLock();
    return;
  }

  const selectedType = String(userRowData[5] || ""); 
  const targetCount = parseInt(userRowData[7]) || 8; 
  const setCount = parseInt(userRowData[8]) || 3; 
  const rawEquipText = String(userRowData[4] || ""); 

  // Équipement
  let userEquip = [];
  const aliasEquip = {
    "dumbell": "dumbbells", "db": "dumbbells", "haltères": "dumbbells",
    "body weight": "bodyweight", "bw": "bodyweight", "none": "bodyweight", "kb": "kettlebell"
  };
  if (rawEquipText) {
    userEquip = rawEquipText.split(",").map(s => {
       let k = s.trim().toLowerCase();
       return aliasEquip[k] || k;
    }).filter(Boolean);
  } else { userEquip = ["bodyweight"]; }

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

  // 4. PREP GLIDE
  if (!shGlide) {
    shGlide = ss.insertSheet(SHEET_GLIDE);
    shGlide.appendRow(["ID", "Order", "Category", "Muscles", "Exercise", "Equipment", "Reps_Text", "Weight_Sugg", "Video_URL", "Is_Done", "UserEmail"]);
  } else {
     const header = shGlide.getRange(1, 1).getValue();
     if (header !== "ID") {
       shGlide.clear();
       shGlide.appendRow(["ID", "Order", "Category", "Muscles", "Exercise", "Equipment", "Reps_Text", "Weight_Sugg", "Video_URL", "Is_Done", "UserEmail"]);
     }
  }

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
    strictCategory: isPilatesMode ? "pilates" : null 
  };

  // 6. GÉNÉRATION
  const output = [];
  let order = 1;
  const usedExercisesCount = {};

  fullPlan.forEach(slotRaw => {
    const slot = String(slotRaw || "").trim();
    const targetCats = slot === "" ? [] : slot.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    userConstraints.targetCategories = targetCats;

    let selected = null;
    let attempts = 0;
    
    while (attempts < 10) {
      selected = pickRandomExercise(null, dbData, dbHeaders, userEquip, userConstraints);
      if (!selected) break;
      const nameIdx = idxOf(dbHeaders, ["nom complet", "name", "exercise"]);
      const exoName = String(selected[nameIdx] || "").trim();
      const count = usedExercisesCount[exoName] || 0;
      const lastExoName = output.length > 0 ? output[output.length - 1][4].split(" - ")[0] : null;
      if (count < 2 && exoName !== lastExoName) break;
      attempts++;
    }

    let exoName = "⚠️ Vide (" + (slot || "vide") + ")";
    let equipName = "—";
    let repsText = "10-12 reps";
    let weightSugg = "";
    let videoUrl = "";

    if (selected) {
      const nameIdx = idxOf(dbHeaders, ["nom complet", "name"]);
      const equipIdx = idxOf(dbHeaders, ["equipment", "equip"]);
      const isoIdx = idxOf(dbHeaders, ["type", "exercise_type"]);
      const catIdx = idxOf(dbHeaders, ["category", "body_category"]);
      const primaryMuscleIdx = idxOf(dbHeaders, ["primary_muscle", "primary"]);

      exoName = String(selected[nameIdx] || "").trim() || exoName;
      equipName = String(selected[equipIdx] || "—").trim();
      videoUrl = "https://www.youtube.com/results?search_query=" + encodeURIComponent(exoName);
      weightSugg = getSuggestedLoad(exoName, histData, targetUserEmail) || "";

      if (isoIdx !== -1 && String(selected[isoIdx]).toLowerCase().includes("isometric")) {
        repsText = "Tenir 30-45s";
      }

      let realCategory = (catIdx !== -1 && selected[catIdx]) ? String(selected[catIdx]).trim() : slot;
      let primaryMuscle = (primaryMuscleIdx !== -1 && selected[primaryMuscleIdx]) ? String(selected[primaryMuscleIdx]).trim() : "";

      for (let s = 1; s <= setCount; s++) {
        let uniqueID = targetUserEmail + "_" + order;
        output.push([uniqueID, order, realCategory, primaryMuscle, exoName + " - S" + s, equipName, repsText, weightSugg, videoUrl, false, targetUserEmail]);
        order++;
      }
      usedExercisesCount[exoName] = (usedExercisesCount[exoName] || 0) + 1;
    } else {
      let uniqueID = targetUserEmail + "_" + order;
      output.push([uniqueID, order, slot, "", exoName, equipName, repsText, "", "", false, targetUserEmail]);
      order++;
    }
  });

  // 7. ECRITURE
  var allData = [];
  if (shGlide.getLastRow() > 1) {
    allData = shGlide.getRange(2, 1, shGlide.getLastRow() - 1, 11).getValues();
  }
  var rowsToKeep = allData.filter(r => String(r[10]).trim().toLowerCase() !== String(targetUserEmail).trim().toLowerCase());
  var finalData = rowsToKeep.concat(output);

  shGlide.getRange(2, 1, shGlide.getLastRow(), 11).clearContent();
  if (finalData.length > 0) {
    shGlide.getRange(2, 1, finalData.length, 11).setValues(finalData);
  }

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
  const muscles = ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Core", "Quads", "Hamstrings", "Glutes", "Calves"];
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

  histData.forEach(r => {
    let histEmail = String(r[10] || "").trim().toLowerCase(); 
    if (histEmail !== String(targetEmail).trim().toLowerCase()) return;

    let date = new Date(r[0]);
    if (isNaN(date.getTime())) return; 
    let hAgo = (now - date) / 36e5;

    let musclesToHit = {};
    let rawName = String(r[4] || "").trim();
    let cleanName = rawName.split(" - S")[0].trim().toLowerCase().split(" [")[0].trim();
    
    // Plan A : DB (Colonne 23 / X)
    if (dbIndex[cleanName] && dbIndex[cleanName][DB_COL_FATIGUE]) {
      musclesToHit = parseMuscleMap(dbIndex[cleanName][DB_COL_FATIGUE]);
    } 
    // Plan B : Fallback Historique
    else {
      let directMuscle = String(r[3] || "").trim(); 
      if (directMuscle) {
        let formattedMuscle = directMuscle.charAt(0).toUpperCase() + directMuscle.slice(1).toLowerCase();
        musclesToHit[formattedMuscle] = 1;
      }
    }

    Object.keys(musclesToHit).forEach(m => {
      // === C'EST ICI QUE LA MAGIE OPÈRE (REGROUPEMENT) ===
      let targetMuscle = m; // Par défaut, on garde le nom original (ex: Chest)

      // Si le nom contient "back" (Upper Back, Lower Back, etc.), on le force en "Back"
      if (String(m).toLowerCase().includes("back")) {
          targetMuscle = "Back";
      }
      
      // (Optionnel) Tu pourrais faire pareil pour les jambes si tu voulais regrouper Quads/Hams en "Legs"
      // if (String(m).toLowerCase().includes("quad") || String(m).toLowerCase().includes("hamstring")) targetMuscle = "Legs";

      // ===================================================

      let recoveryTime = MUSCLE_RECOVERY[targetMuscle] || 48;
      
      if (hAgo < recoveryTime) {
        let decay = 1 - (hAgo / recoveryTime);
        let impact = (musclesToHit[m] || 1) * 50; 
        
        // On applique la fatigue sur le muscle regroupé (targetMuscle)
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
    if (!isNaN(v)) o[parts[0].trim()] = v;
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

function parseMuscleMap(str) {
  if (!str) return {};
  let o = {};
  String(str).split(";").forEach(p => {
    let parts = p.split(":");
    if (parts.length < 2) return;
    let v = parseFloat(parts[1]);
    if (!isNaN(v)) o[parts[0].trim()] = v;
  });
  return o;
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
    const data = JSON.parse(e.postData.contents);
    
    if (data.action === "FORCE_REGENERATE" && data.userEmail) {
      generateWorkout(data.userEmail);
      return ContentService.createTextOutput(JSON.stringify({status: "success"}));
    }
    return ContentService.createTextOutput(JSON.stringify({status: "ignored"}));
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({status: "error", msg: err.toString()}));
  }
}