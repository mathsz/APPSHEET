# Use IMPORTRANGE to share one database

You can keep a single "production" Google Sheet as the source of truth and pull its data into the FITBOOK TEST spreadsheet using `IMPORTRANGE`. This is reliable, read-only, and ideal for tables like `ExerciceDB`.

## Steps

1. Share the production sheet with the FITBOOK TEST account
   - Ensure the account opening FITBOOK TEST has at least Viewer access to the production sheet.

2. Get the production spreadsheet ID
   - The ID is the long string in the URL between `/d/` and `/edit`.
   - Example: `https://docs.google.com/spreadsheets/d/1ABCDEF...XYZ/edit` → ID is `1ABCDEF...XYZ`.

3. In FITBOOK TEST, create a simple config cell for the ID (optional but recommended)
   - Create a sheet named `Config` and put the ID in `B2`.

4. Import the source tables via IMPORTRANGE
   - ExerciceDB (all columns):
     - `=IMPORTRANGE(Config!B2, "ExerciceDB!A:Z")`
     - Or with full URL: `=IMPORTRANGE("https://docs.google.com/spreadsheets/d/1ABCDEF...XYZ/edit", "ExerciceDB!A:Z")`
   - Glide_HIIT (if needed):
     - `=IMPORTRANGE(Config!B2, "Glide_HIIT!A:Z")`
   - First time, you'll see `#REF!` → click "Allow access" to authorize the import.

5. Optionally filter/shape data with QUERY
   - Example (filter by session type, keep headers):
     - `=QUERY(IMPORTRANGE(Config!B2, "ExerciceDB!A:Z"), "select Col1,Col2,Col5 where Col7='Upper'", 1)`
   - Use explicit ranges (e.g., `A:Q`) to limit recalculation.

## Best practices

- Centralize the ID: put the production ID in one place (e.g., `Config!B2`) and reference it across formulas.
- Keep headers consistent: `QUERY(..., 1)` expects a header row; maintain stable column order in the source.
- Read-only by design: `IMPORTRANGE` data cannot be edited in the destination. Write generated outputs (e.g., `Glide_Wod`, `History`) to normal sheets in FITBOOK TEST.
- Performance: limit columns, avoid volatile functions, and prefer `QUERY(IMPORTRANGE(...))` to pull only what you need.
- Named ranges (optional): defining named ranges in the production sheet can simplify imports, e.g., `=IMPORTRANGE(Config!B2, "ExerciceDB_All")`.

## Alternative (Apps Script)
If you prefer not to use formulas, you can have Apps Script read from the production sheet directly:
- Store the production Spreadsheet ID in Script Properties.
- Use `SpreadsheetApp.openById(id)` and `getRange(...).getValues()` inside your generator functions.
- This keeps a single DB without relying on sheet formulas and can reduce recalculation overhead.

Both approaches work. For quick setup and transparent data flow inside FITBOOK TEST, `IMPORTRANGE` is the simplest and keeps one database to maintain.