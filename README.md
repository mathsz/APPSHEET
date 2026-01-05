# APPSHEET

## Milestone v0.5a

This release marks a stable Setup and Durée persistence flow for Strength workouts and improved UX.

Changes:
- Rename app to HomeWorkouts
- Strength-only equipment enforcement with greyed, unselectable options otherwise
- Manual Save: persist setup, trigger generation, show immediate splash/loading, navigate to Workout
- Durée handled as numeric minutes and reliably written to UserProfile `DUREE` (col H)
- Backend alignment: new Apps Script deployment; PWA uses dawn-dream proxy by default
- Removed Yoga/Pilates from PWA

Notes:
- Settings panel allows overriding backend URL/token/proxy
- HIIT endpoints available; end-to-end verification deferred