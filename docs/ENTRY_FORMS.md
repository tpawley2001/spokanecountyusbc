# Tournament entry forms: how they work

This covers the fillable PDFs, the online entry forms, payments and how to add a new form.
Server hosting, deploy steps and credentials are documented privately, not in this repo.

## The pieces

| What | Where | Notes |
|---|---|---|
| Fillable PDF forms | `forms/<slug>.pdf` | Served by the `PUBLIC_FILE` allowlist in `server.js` (`forms/*.pdf`). |
| Field layout for each PDF | `scripts/form_fields/<slug>.json` | The reviewed spec used to add the fields. Re-apply with `make_fillable.py`. |
| PDF field tools | `scripts/detect_blanks.py`, `scripts/make_fillable.py` | Draft a spec from a PDF, then apply it. |
| Online entry form definition | `entry-forms/<slug>.json` | Layout, fields, rules and payment for one tournament. |
| Online entry page | `entry.html?form=<slug>` + `entry-page.js` | Draws the definition so it looks like the paper entry sheet. |
| Submission handling | `entries.js` (mounted by `server.js`) | Validates the entry, fills the PDF, emails it, keeps a backup copy. |
| Tournament table | `site-data.json` → `tournaments[]` | `entry_form` = PDF path, `online_form` = slug. The table HTML is generated from it. |
| Payment QR codes | `images/pay/paypal-qr.svg`, `venmo-qr.svg` | PayPal paypal.me/SCUSBC, Venmo @Spokane-USBC. |

## Online entry flow

1. `GET /entry/form/<slug>` returns the definition, minus the PDF path, with the tournament
   name taken from `site-data.json`, so a rename in the admin panel carries through.
2. The bowler fills it in. The page shows the amount due as they go.
3. `POST /entry/submit/<slug>` is **not** under `/api/`, because Cloudflare Access protects
   `/api/*` for the admin panel. The server:
   - validates every field (required, email, phone, average 0-300);
   - drops bots silently via the hidden `website` honeypot;
   - applies rate limits: 5 an hour per IP, 60 an hour in total;
   - writes the values into the fillable PDF and **flattens** it. The printed copy is black
     ink with no live fields, because Gmail and phone previews and printers often drop form
     fields;
   - emails the association manager with the subject **"<Tournament Name> Entry Form"**,
     reply-to the entrant, and the printable PDF attached;
   - appends the entry to `entries/<slug>.jsonl`, which is gitignored and never served, as a
     backup.
4. The confirmation shows the amount due, PayPal and Venmo buttons with the amount prefilled
   (Venmo also gets a note), the QR codes, the check option, and a download of the entry.

Mail settings come from environment variables: `SMTP_USER`, `SMTP_PASS`, optional
`SMTP_HOST`/`SMTP_PORT` (default Gmail on 465) and `ENTRY_TO` (default: the association manager).
**Set `ENTRY_TO` to your own address while testing** so test entries don't reach the association manager.

## `entry-forms/<slug>.json`

Copy an existing one: `bvl-veterans-doubles.json` is the simplest.

- `tournament`: the fallback name if no tournament in `site-data.json` points at this slug.
- `pdf`: the fillable PDF to fill in. **Field names must match the PDF's field names.**
- `fields`: `{name: {label, required, max, type}}`. The types are:
  - text (the default)
  - `email`
  - `tel`
  - `average` (0-300)
  - `check` (a checkbox that prints "X" on the PDF; branch `forms-2026-27`, not live yet)
- `fee_per_person`, `fee_people_fields` (the fields that count as a paying person),
  `fee_unit` (the word after the fee in the email; branch only).
- `event_picks` (branch only): `[{name, events: [...], error}]`. A named bowler must tick
  at least one event, and an event can't be ticked for a blank bowler.
- `sheet`: blocks drawn in order, to look like the paper form:
  - `logos`: `[{src, alt}]`
  - `title` / `subtitle`: lines of text
  - `text`: `[{t, red, bold}]`, with `size` sm/md/lg
  - `heading`
  - `row`: `[{label, field, grow}]`, optionally `center`
  - `total`: the running amount due, with an optional `note`
- `rules`: `{title, items: [...], footer}`. Use **only text that is visible on the printed
  form**. Word files can hide white text.
- `payment`: `{paypal, venmo, paypal_qr, venmo_qr, checks}`. Copy it from an existing form
  unless the tournament's payment instructions differ.

## Fillable PDFs

1. `scripts/detect_blanks.py forms/X.pdf --overlay DIR [--dpi N]` drafts
   `scripts/form_fields/X.json`. It looks for underscore runs, drawn lines, ❒ box glyphs, and
   lines in the pixels of scanned pages, and it splits a line at the captions printed under it.
   **The draft is always noisy.** Look at the overlay images, then rename and prune by hand.
2. `scripts/make_fillable.py forms/X.pdf` applies the spec. It deletes any existing fields
   first, so it's safe to re-run.
3. Test-fill every field and render the pages to check by eye.

Scanned forms and forms whose text is drawn as outlines have no text layer to go on. Place
those fields from measured pixel positions. `usbc-board-application.json` and
`spokane-city-hall-of-fame-nomination.json` are examples.

## Adding a tournament's entry form

1. Get a clean PDF. For a .docx, use LibreOffice (`soffice --headless --convert-to pdf`) and
   drop pages that render blank. No Microsoft Word is needed or assumed. Old Word files laid
   out as text boxes over a background picture don't render correctly outside Word, so rebuild
   those as normal table-based documents.
2. Make it fillable (above), as `forms/<slug>-entry.pdf`.
3. Write `entry-forms/<slug>.json` so it looks like the paper sheet. Put logos in `images/entry/`.
4. In `site-data.json`, set the tournament's `entry_form` and `online_form`, then regenerate
   the tables through the admin API (`POST /api/tournaments`). The tables in
   `tournaments.html`/`index.html` are generated, so never edit them by hand.
5. Test on a local server with `SMTP_*` unset. Check that the page loads, that a bad submit
   shows field errors, and that a sample PDF fill puts every value on its blank. Look at it at
   desktop and phone widths.

## Things that bite

- **CSP:** there is no inline JavaScript. Page code lives in external `.js` files, and a new
  one must be added to `PUBLIC_FILE`.
- **New public file types or folders** also need a `PUBLIC_FILE` entry, or they return 404.
- **Admin edits on the live server rewrite tracked files.** Before any deploy, check the
  live checkout for local changes.
