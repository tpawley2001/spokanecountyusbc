# SCUSBC Tournament System — Plan (draft, 2026-11-14)

Goal: run our own tournaments on spokanecountyusbc.org instead of TournamentBowl.
The board enters entries directly (and online-form entries flow in on their own),
the board keys in scores on tournament day, and the public sees live standings.

**Mockup:** `mockup/tournament/` (GitHub Pages copy only; the live server does not serve
that folder). `index.html` = public live results, `board.html` = board desk. Sample data only.
Open both in the same browser; a score typed on the board page shows up on the live page.

## Prior art (searched 2026-11-14)

Nothing open source fits. GitHub, npm and PyPI only have toy or coursework bowling projects.
`evroon/bracket` handles head-to-head brackets, not pinfall totals. The one full product is
CDE Software's Bowling Tournament Manager, which is commercial Windows software that publishes to
its own results site. It's the feature checklist to copy. Lane systems (Qubica Conqueror,
Brunswick Sync) have no public score API, so plan on hand entry, with photo/OCR of lane printouts
as an optional extra later.

## What it does

| Area | Public | Board |
|---|---|---|
| Entries | Online entry form (exists today: `entries.js`) | Add/edit/withdraw entries, USBC # → name + average lookup, paid/method, duplicate check |
| Squads & lanes | Squad list with status | Squads per event, lane assignment, check-in + paid on one screen (folds in the check-in desk) |
| Scores | — | Per-lane score cards, saves per game, squad "final" locks scores |
| Results | Live standings per event, handicap + scratch views, all-events, cash line, bowler search | Same, plus printable final standings and prize list |
| Rules | Shown in the page header | Handicap base / % / max, prize ratios, fees, all-events on/off, per tournament |

## Design rules

- **Handicap is never stored with a score.** Store raw games + the entering average; every
  standing is figured on read. Fixing an average or a rule re-figures everything (same lesson as
  bracket-live).
- **Rules are per tournament settings**, not code: handicap % of base (USBC sample rules use
  100% of 230; the 2026 USBC Senior Championships use 90% of 220), optional max, prize ratio for
  events and for all-events (USBC sample minimums are 1 in 10 and 1 in 15; USBC Open
  Championships uses 1 in 5 and 1 in 8). The Association Manager supplies each tournament's numbers.
- **No-average bowlers** bowl scratch (0 handicap) unless the rules say otherwise; a missing average
  is held for the board to resolve, never defaulted silently.
- **Ties**: tied entries share the place and split the money for those places. Only an event's
  rules can add a tiebreaker.
- **Every board change is logged** (who, when, before/after), and the log is visible to the board.
- **Live updates** by short polling (`state?since=rev` every ~4 s), the same as the check-in desk.
  No websockets needed at this size.

## Where it runs

Inside the existing site server on the usbc box (`server.js` → new `tournament.js` module, like
`checkin.js` and `entries.js`), because the online forms, the check-in desk and the public site
are already there.

- Storage: SQLite via `node:sqlite` (the box runs Node 22.22, which has it built in). One file per
  season, backed up nightly with the rest of the app data.
- Public pages: `/t/<slug>` (live results) served by the router, not by `PUBLIC_FILE`.
- Board desk: under `/api/t/…` so the existing Cloudflare Access gate covers it. It's open
  question 1 below: board members need logins, so the Access policy gets their emails
  (or a per-member PIN login on top).
- Entry intake: new online-form submissions (`entries/<slug>.jsonl`) become entries automatically.
  Paper forms are typed in by the board. TournamentBowl sync is retired once this is live.

## Data model (first cut)

```
tournament(id, slug, name, center, dates, hdcp_base, hdcp_pct, hdcp_max, prize_ratio,
           ae_ratio, ae_enabled, fees_json, status[draft|open|live|final])
event(id, tournament_id, kind[team|doubles|singles], size, games, division[hdcp|scratch|both])
squad(id, tournament_id, label, starts_at, events_json, status[upcoming|live|final])
bowler(id, usbc_no, first, last, gender, birth_year)        -- shared across tournaments
entry(id, event_id, squad_id, lane, team_name, paid_cents, pay_method, source[online|paper|board],
      withdrawn_at, created_by)
entry_member(entry_id, bowler_id, position, entering_avg, avg_source[bowlcom|form|board])
all_events(tournament_id, bowler_id, paid_cents)
game(entry_id, bowler_id, game_no, score, entered_by, entered_at)
audit(id, at, who, action, before_json, after_json)
```

## Phases

1. **Mockup + feedback (now).** Walk the board through `mockup/tournament/`. Settle the open
   questions below.
2. **Entries.** Schema, board desk entry screens, online-form import, bowl.com average lookup
   (reuse the existing lookup), entry list + fee totals, CSV/print export.
3. **Scores + live results.** Score cards, squad final/lock, public `/t/<slug>` with standings,
   all-events and the cash line. Load-test with a fake 300-entry tournament.
4. **Tournament day tools.** Fold in the check-in desk (roster comes from our own DB instead of
   a TournamentBowl export), lane assignment + printable lane sheets, final standings + prize
   list PDF.
5. **Pilot.** Run one small tournament on both systems side by side (TournamentBowl stays the
   official one) and compare every standing. Then switch.

## Open questions (for the board / Association Manager)

1. Who on the board enters entries and scores, and how do they log in?
2. Which tournament is the pilot? (Holiday Smash 12-20 or Youth Championships 1-10 are the next
   small ones.)
3. Online payment: keep "pay at the house" (today's behavior) or add card payments later?
4. Prize lists: does the board want the system to figure payouts from the prize fund, or only
   show who's in the money?
5. Does anything (state association, sanction paperwork) need TournamentBowl specifically, or
   just a results report we can print?
