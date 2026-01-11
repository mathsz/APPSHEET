# Homeworkouts PWA

Minimal offline-ready web app with Firebase Auth and Apps Script backend.

## Setup

1. Install dependencies:

```bash
cd pwa
npm install
```

2. Configure Firebase:
- Open `src/config.js` and fill `firebase` fields: `apiKey`, `authDomain`, `projectId`, `appId`, etc.
- (Optional) Copy `src/config.example.js` to compare.

3. Backend URLs:
- `backend.execUrl`: Apps Script Web App `/exec` URL (already set)
- `backend.token`: security token (already set)
- `backend.proxyBase`: Cloudflare Worker URL to avoid redirects and add CORS

### Local runtime config (safe & gitignored)

This PWA expects a runtime `public/config.json` with the backend values. For safety `public/config.json` is ignored by git and not committed. Use the example file to create your local config:

```bash
cp pwa/public/config.example.json pwa/public/config.json
# edit pwa/public/config.json and set execUrl, token, proxyBase
```

If you need to test from a phone quickly, use the bookmarklet workflow or I can generate a small bookmarklet to seed values into localStorage.

## Run

```bash
npm run dev
```
Open the printed localhost URL.

## Features
- Google Sign-In (popup)
- Workout list: fetches Glide_Wod summary for the signed-in email
- Replace exercise: calls backend webhook via proxy, auto-refreshes
- PWA: manifest + service worker for basic offline caching

## Deploy
- Static hosting: Vercel/Netlify/Cloudflare Pages
- Or Firebase Hosting:

```bash
npm run build
# firebase init hosting (once)
# firebase deploy --only hosting
```

## Notes
- If GET to Apps Script fails due to CORS/redirect, ensure `proxyBase` is set.
- For HIIT Timer, we can embed the Apps Script page (`?page=timerhiit&email=<user>`) in a dedicated route.
