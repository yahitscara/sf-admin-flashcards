# Salesforce Admin Flashcards — App Spec

Nov 10, 2026 · @face

A small web app to study for the Salesforce Platform Administrator exam from any device, built from a seed file of cards and growing by one JSON file per practice exam.

## Goal and scope

One user (Face) studying for the Salesforce Certified Platform Administrator exam: 60 questions, 105 minutes, 68% to pass, proctored and closed book. Practice exams need 95%+.

- Study from phone or laptop, no login required for v1.
- Every card keeps the **justification** and the **trap** (why wrong answers are wrong), not just the answer. That's where the learning happened.
- Cards are tagged to the instructor's **8 exam objectives**, so study can focus on weak areas.
- New cards arrive after each practice exam as a JSON file in the same format.
- Out of scope for v1: accounts, multi-user, cross-device sync of progress, AI generation inside the app.

## Stack and hosting

A static site in a GitHub repo, deployed free to GitHub Pages (or Vercel/Netlify). Cards are JSON files in the repo; study progress lives in the browser.

| Piece | Choice | Why |
| --- | --- | --- |
| Framework | Vite + vanilla TypeScript (or plain HTML/JS) | No backend, tiny, fast on phones |
| Card storage | `/data/*.json`, one file per source | Adding an exam = adding a file |
| Card index | `/data/manifest.json` listing the files to load | App loads every listed file |
| Progress | `localStorage` (known / unsure / missed per card id) | No login needed; wrap in try/catch |
| Hosting | GitHub Pages via a GitHub Action on push | Free URL usable from any device |
| Install | PWA manifest + service worker | Add to home screen, works offline |

v2 option: Supabase (free tier) to sync progress across devices.

## Card data format

Every data file is a JSON object with a `source` and a `cards` array. The app must validate files against this shape and skip bad cards with a console warning, not crash.

```json
{
  "source": "exam-2",
  "title": "K2U Practice Exam 2",
  "cards": [
    {
      "id": "exam2-q13",
      "type": "question",
      "objective": "data-analytics",
      "prompt": "Manager wants a daily email if open cases exceed 100. Best way in Lightning?",
      "options": ["Schedule a report refresh", "Validation rule", "Ask the manager to subscribe to an open case report", "Record-triggered flow"],
      "answer": ["Ask the manager to subscribe to an open case report"],
      "why": "Report subscriptions in Lightning run on a schedule and can have conditions (Record Count > 100).",
      "traps": "Record-triggered flows fire per record and can't count totals; scheduled refresh is Classic.",
      "strip": "Notify on a schedule when a number crosses a threshold → subscription with conditions.",
      "tags": ["reports", "subscriptions"],
      "missed": true
    }
  ]
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `id` | Yes | Unique across all files, e.g. `exam1-q09`, `obj-config-01`, `concept-tsmj` |
| `type` | Yes | `question` (has options), `concept` (fact or rule), or `objective` (instructor note) |
| `objective` | Yes | One of the 8 keys below |
| `prompt` | Yes | The front of the card |
| `options` | No | Present for `question` cards; shuffle on display |
| `answer` | Yes | Array of strings; multi-select = several items |
| `why` | Yes | Justification shown on the back |
| `traps` | No | Why the wrong options are wrong |
| `strip` | No | One-line Strip Method takeaway |
| `tags` | No | Free-form topics for search |
| `missed` | No | True if Face got it wrong on first try (weights it in review) |

Objective keys and exam weights: `config-setup` 15%, `data-analytics` 17%, `productivity` 10%, `service` 10%, `object-manager` 15%, `sales-marketing` 10%, `automation` 15%, `agentforce` 8%.

## Features for v1

Four study modes, a dashboard by objective, and a JSON import screen. Mobile-first layout.

1. **Flashcards:** front = `prompt`; tap to flip → `answer`, `why`, `traps`, `strip`. Mark **Got it / Unsure / Missed**.
2. **Quiz:** `question` cards show shuffled `options`; select one or more (multi-select shows "Choose N"); submit, then show the back of the card. Score at the end, broken down by objective and weighted like the real exam.
3. **Strip drill:** shows only the `prompt`. User types their strip (subject, verb, condition, traps), then reveals the card's `strip` line to compare. No grading.
4. **Weak spots:** a deck of cards marked Missed or Unsure, plus anything with `missed: true` not yet marked Got it.

Dashboard and filters:

- Per-objective progress bars (Got it / total) with the exam weight shown.
- Filter any mode by objective, source file, type, or tag; search across prompt and why.
- "Reset progress" with a confirm.

Import screen (the "space to add new questions"):

- A text box to paste a cards JSON file, validate it, preview the count by objective, and save it to `localStorage` as a local deck.
- "Export local decks" downloads them as `.json` so they can be committed to `/data/`.
- Duplicate `id`s: the newer card wins, with a warning listing them.

## Adding a new exam's cards

After each practice exam, Claude (in the Chrome side panel) reads the review page and writes `exam-N.json` in the format above.

1. Finish the exam and open the review/results page.
2. Ask Claude in the side panel: "Make the cards file for this exam." It writes one card per question with the site's explanation in `why`, the trap reasoning in `traps`, a `strip` line, and `missed` set from the results.
3. Either paste it into the app's Import screen (works right away on that device), or drop it into `/data/` and add it to `manifest.json`, then push (works on every device after deploy).

Seed files to commit on day one: `instructor-objectives.json` (the 8 objectives as concept cards), `concepts.json` (rules and tables from the Study Map and Strip Method), `exam-1.json`, `exam-2.json`.

## Build steps for Claude Code

Paste this spec and the seed JSON files into Claude Code, then ask it to work through these in order.

1. Scaffold a Vite + TypeScript app; add a GitHub Action that builds and deploys to GitHub Pages on push to `main`.
2. Put the seed files in `/public/data/` with a `manifest.json` listing them.
3. Write the card schema as a TypeScript type plus a validator; load every manifest file plus local decks from `localStorage`.
4. Build the dashboard, then Flashcards, Quiz, Strip drill, Weak spots, then Import/Export.
5. Add the PWA manifest and service worker for offline use and add-to-home-screen.
6. Test on a phone-width viewport; confirm progress survives reloads and a broken JSON file is skipped with a warning.

Done when: the site loads at a public URL on a phone, every seed card appears under the right objective, a pasted `exam-3.json` shows up immediately, and the quiz score is weighted by objective.
