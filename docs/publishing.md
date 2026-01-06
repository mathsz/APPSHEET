# Publishing & CI

This document describes the required secrets and how the CI workflow builds and (optionally) deploys both the PWA (Firebase Hosting) and the Google Apps Script using clasp.

## What the CI does
- Runs unit tests (Vitest) located in `pwa/tests`.
- Builds the PWA (`npm --prefix pwa run build`).
- Optionally deploys the PWA to Firebase Hosting if GitHub secrets `FIREBASE_TOKEN` and `FIREBASE_PROJECT` are set.
- Optionally deploys the Apps Script project using `clasp` if `GCP_SA_KEY` and `CLASP_SCRIPT_ID` secrets are present.

The workflow file is `.github/workflows/ci-deploy.yml`.

## Required secrets for Apps Script deploy
- `GCP_SA_KEY` — the _entire_ service account JSON (copy/paste the JSON contents into the secret value). Create a service account in the Google Cloud project and download the JSON key.
- `CLASP_SCRIPT_ID` — the Apps Script *Script ID* (found in the Apps Script editor: **Project settings → Script ID**).

Notes:
- Add the service account email (from the JSON) as an Editor on the Apps Script project (open the project in the Apps Script editor → Settings → Share). This is required so the service account can push and create versions.
- Ensure the **Apps Script API** is enabled in the GCP project.

## Optional secrets for PWA deploy
- `FIREBASE_TOKEN` — CI token from `firebase login:ci`.
- `FIREBASE_PROJECT` — your firebase project id used for hosting.

## Manual deploy (local)
1. Install clasp: `npm i -g @google/clasp`
2. Save `sa-key.json` with your service account JSON.
3. `echo '{"scriptId":"<SCRIPT_ID>"}' > .clasp.json`
4. `npx clasp login --creds sa-key.json`
5. `npx clasp push` and `npx clasp version "manual deploy <date>"`

## Security & Rollback
- The CI creates a new version for each clasp deploy. You can rollback to a previous version from the Apps Script Editor or by using `clasp deploy --deploymentId <id>`.

## Next steps / Improvements
- Add a small GitHub Action to automatically tag releases on `main` merges and attach the Apps Script version number to the tag.
- Add a staged deploy job that deploys only to a pre-production project on pushes to `staging`.

If you'd like, I can now:
- Add a staging job and release tagging automation.
- Create a Secrets/Docs checklist (with required user steps) and open a PR with the workflow and docs. Let me know which you'd prefer me to do next.