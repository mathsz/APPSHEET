AppSheet change plan — Fitbook

Summary
- I have editor access for githubfixer@gmail.com and will apply these changes directly to the AppSheet app.
- Goal: map `ExerciceDB.ID` as the key (numeric), show human names in UI, make `Sets.Exercise` a Ref storing numeric ID, add filtered dropdown (equipment & muscle), require SetNumber/Reps > 0, add Replace exercise action (webhook to Apps Script), and test end-to-end.

Webhooks / endpoints
- Replace webhook (POST):
  URL: <YOUR_WEB_EXEC_URL>
  Body (JSON):
    {
      "action": "REPLACE_EXERCISE",
      "setId": "<<[ID]>>",
      "token": "TEMP_CREATE_SETS_TOKEN_20260101"
    }
  Headers: Content-Type: application/json
  Notes: Use the deployment exec URL for the webapp (the project has multiple deployments; use the active deployment). The shared TEMP token is used for protection.

Steps to apply (I will perform these via the AppSheet editor):
1) Data → Tables → Regenerate Structure for `ExerciceDB` and `Sets`.
2) ExerciceDB table:
   - Key column: `ID` (make sure `ID` column exists and contains the numeric string values — already populated via `FORCE_FILL_EXODB_IDS`).
   - Label: set to `nom complet` or `name` (so UI shows friendly names).
3) Sets table:
   - Column `Exercise`: Type = Ref → Table: `ExerciceDB`.
   - Add a Virtual Column `Exercise_Display` with App formula: LOOKUP([Exercise], "ExerciceDB", "ID", "nom complet") to show the name.
   - Make `SetNumber` and `Reps` required and add Valid_If: `[_THIS] > 0`.
   - For `Exercise` column Valid_If (filtered by Glide row equipment & muscles), example template (adjust to your column names):
     SELECT(
       ExerciceDB[ID],
       AND(
         OR(
           ISBLANK(LOOKUP([_THISROW].[Glide_Wod_ID],"Glide_Wod","ID","Equipment")),
           IN([Equipment], SPLIT(LOOKUP([_THISROW].[Glide_Wod_ID],"Glide_Wod","ID","Equipment"),","))
         ),
         OR(
           ISBLANK(LOOKUP([_THISROW].[Glide_Wod_ID],"Glide_Wod","ID","Muscles")),
           IN([Primary_Muscle], SPLIT(LOOKUP([_THISROW].[Glide_Wod_ID],"Glide_Wod","ID","Muscles"),","))
         )
       )
     )
   - Note: I will tweak this exact Valid_If once I see the actual column names in AppSheet.
4) UX / Actions:
   - Create an action "Replace exercise" on `Sets`:
     - Behavior: External: Webhook
     - URL: web exec URL (POST)
     - Body: JSON as above (set `setId` to `<<[ID]>>`)
     - After action: optionally trigger an app-formula-driven sync or add a follow-up action to re-sync.
   - Place the action prominently on `Sets` detail view and inline list.
5) Testing:
   - On seeded Set rows: tap Replace → the webhook hits Apps Script doPost (which calls replaceExerciseForSet) → confirm via `DUMP_SETS` that the `Exercise` value changed and `Exercise_Display` shows name.
   - I will run a few Replace calls via the UI and directly via our webhook to validate behavior.
6) Follow-up adjustments:
   - If any mismatch occurs (e.g., ExerciceDB key mismatch), I will adjust `fillExerciceDBSequentialIds()` or change the key mapping accordingly.

Rollback plan
- If anything breaks, revert the table structure in AppSheet (repoint `Exercise` to previous column type) and I can revert script changes or undo the ID fill (I have the previous backups in the commit history).

Notes for the user
- I will now proceed to apply these changes using the editor account you confirmed (githubfixer@gmail.com). I will update this repo and memory with final verification results when done.
