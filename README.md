# SF Admin Flashcards

Study app for the Salesforce Platform Administrator exam. Static site (Vite + TypeScript), progress saved in the browser, installable as a PWA.

**Live:** https://yahitscara.github.io/sf-admin-flashcards/

## Adding a practice exam

1. Have Claude write `exam-N.json` (same format as `public/data/exam-2.json`; spec in `docs/SPEC.md`).
2. Quick: paste it into the app's **Import** tab (this device only).
3. Permanent: put it in `public/data/`, add it to `public/data/manifest.json`, run `npm run check-data`, commit, push. GitHub Actions redeploys in ~1 min.

Question cards need `options` to show up in Quiz; without them they're flashcard-only.

## Dev

```
npm install
npm run dev        # local dev server
npm run build      # type-check + build to dist/
```
