# REVE Office

The REVE Boulder leasing office web app: tour flyers, availability, expiring
leases, waitlist, site map, documents, turns, residents, renewals and the
password-protected Admin tools (MMR, Commissions, PCard, Deposit Accounting,
Blueprints, INFO). Live at <https://reveboulder.github.io/tour/>.

## How it's built

- `index.html` — the whole app (HTML, CSS and JavaScript in one file).
- `suggestions.js` — storage, file format and copy tracking for
  Settings › Suggest Improvements (kept separate so it can be unit tested).
- `documents/`, `floorplans/`, `MEDIA_Floorplans/`, `stickers/` — static files.
- Shared data goes through a Google Apps Script web app (a Google Sheet
  key/value store, plus Google Drive for filed PDFs). Its URL is set in
  Admin › Settings › Shared Backend (a device with no URL yet is asked for it
  on the Admin sign-in screen); without it, data stays in the browser.

## Versions and sync status

The top banner shows a sync dot (green saved, amber saving, gray offline or
not connected, red not saved) and the app version. Clicking the version opens
the history from `versions.json`, with an "Update to latest version" button;
a small Update flag appears when a newer version is deployed. Each deploy
bumps `APP_VERSION` in `index.html` and adds an entry to `versions.json`.

## Offline use

`sw.js` (a service worker) and `manifest.webmanifest` make the app installable
and usable offline: the page and `versions.json` load network-first with the
last copy used offline; app files, web libraries and fonts are kept on the
device; floorplans and built-in documents are stored ahead of time (the app
sends the list). The shared backend is never cached — edits that can't be
saved go to an outbox in `localStorage` and are sent when back online, unless
someone else changed the same data meanwhile (then their copy is kept).

## Suggest Improvements

Settings › Suggest Improvements lets you write down ideas for future updates
while using the app.

- Each suggestion is saved to the browser's `localStorage` first, so it works
  offline. The list shows newest first, with the date, whether it's been
  copied off the device yet, and a delete button.
- When online, the whole list is written to Google Drive as
  **`REVE Office/Suggested improvements.md`** (in a "REVE Office" folder next
  to "REVE Backend Files"), replacing the file each time. The file is stored
  in **plain text**, not encrypted, so Claude Code can read it in later
  sessions (see `CLAUDE.md`).
- It copies when the section opens, after a save or delete, and when the
  device comes back online. If it can't, the status says why: offline, not
  connected (no backend URL in Admin › Settings, Test mode, or the backend script hasn't had the
  v7 update), or the error.
- File format:

  ```
  # REVE Office: suggested improvements
  Updated <ISO timestamp>.
  - [ ] YYYY-MM-DD (<id>): <suggestion text, newlines replaced by " / ">
  ```

- Backend: the Apps Script needs the v7 `saveSuggestions` action (it writes
  the file with `setContent`, so there is only ever one copy).

## Tests

```
node --test tests/suggestions.test.js     # unit tests (Node 18+)
node tests/e2e/suggestions.e2e.js         # end-to-end (needs Playwright + Chromium)
```

The end-to-end test serves the repo itself, uses a stand-in backend answered
inside the test (no real URL or credentials), and reads optional
`PLAYWRIGHT_PATH`, `CHROMIUM_PATH` and `LIB_DIR` environment variables.

## Deploy

Work on a branch, open a pull request to `main` and merge it. GitHub Pages
redeploys `main` automatically; hard-refresh (or Settings › Refresh Site to
Update) to load the new version.
