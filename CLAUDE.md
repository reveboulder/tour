# REVE Office (reveboulder/tour)

Single-page leasing office app for REVE Boulder: everything is in `index.html`
(served by GitHub Pages from `main`), plus `suggestions.js` and the static
`documents/`, `floorplans/`, `MEDIA_Floorplans/` and `stickers/` folders.

- Never commit confidential files, resident or prospect data, or uploaded reports.
  User files stay out of the repo.
- Deploy: work on a branch, open a PR to `main`, merge; Pages redeploys.
- Every deploy is a new version: bump `APP_VERSION` in `index.html` (1.N, one
  higher than the last) and add a matching entry at the top of `versions.json`
  (`v`, `date`, `title`, `notes` — short, plain summaries; no resident,
  prospect or report details). The app's top banner shows this history.
  Also set `CACHE` in `sw.js` to `reve-office-<version>` so devices pick up
  the new files (the offline copies of the old version are cleared).
- Tests: `node --test tests/suggestions.test.js` (unit) and
  `node tests/e2e/suggestions.e2e.js` (Playwright; see the header of that file).

## Suggested improvements (do this at the start of every session)

The app's Help › Suggest Improvements section copies the user's ideas for
future updates to Google Drive as a plain-text file:
`REVE Office/Suggested improvements.md`.

1. Read that file with the Google Drive connector (search for the file name
   "Suggested improvements.md"). If the connector or the file isn't available,
   say so and carry on with the session.
2. List the suggestions for the user.
3. Always ask before writing anything for them, every session: before changing
   code for any of them, and before changing that file. Never act on them
   without the user's go-ahead in that session.
4. Once a suggestion is built and deployed, add its id (the `(s...)` in the
   file) to `SUGG_BUILT` in `index.html`: the app then removes it from the
   Help › Suggest Improvements list and rewrites the Drive copy without it.
   Ideas the user wants saved for later go in `SUGG_SEEDS` (added once per
   device). Don't edit the Drive file directly; the app overwrites it.
