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
- Board desk: under `/api/t/…` so the existing Cloudflare Access gate covers it. Entries are
  done by Tyson and the Association Manager (decided 2026-11-14), so the only change is adding
  the Association Manager's email to that Access policy. The audit log records which of the two
  made each change.
- Entry intake: new online-form submissions (`entries/<slug>.jsonl`) become entries automatically.
  Paper forms are typed in by the board. TournamentBowl sync is retired once this is live.

## Scores from the houses (decided 2026-11-14)

Tyson is working with the houses so they send scores to us instead of the board typing every
game. Two ways in, both landing in the same place:

1. **A small sender program on the house's scoring PC.** QubicaAMF Conqueror can already write a
   score export file for tournament software, and Brunswick Sync can export scores at the front
   desk. The sender watches that export folder and uploads each new file to
   `/api/t/<slug>/house-scores` with a per-house key. First step: ask each house which scoring
   system and version it runs, and get one sample export file.
2. **Email.** The house emails the export file, a printout PDF or a photo of the recap to
   Tyson's email. A watcher picks up mail from known house addresses (or with a tournament tag
   in the subject), reads the attachment (file parser, or OCR for PDFs/photos, the same approach
   the BLS sheet reader uses) and posts it to the same endpoint.

Either way, house scores land as **pending**: each game is matched to an entry by lane + bowler
name/USBC #, and the board desk shows "from Lilac Lanes, 12 games, 2 didn't match". One click
posts the matched games; unmatched ones get fixed by hand. The board can still type any score
directly, and a typed score always wins over a house file. Once a house's files have matched
cleanly for a few tournaments, its scores can post on arrival without the click.

Today's houses for the season: Players, Valley Bowl, Lilac Lanes, North Bowl.

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
game(entry_id, bowler_id, game_no, score, entered_by, entered_at, source[board|house])
house_batch(id, tournament_id, house, via[sender|email], received_at, file, status, matched, unmatched)
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
5. **Pilot: first run TBD** (Tyson 2026-11-14: Holiday Smash is too complicated for the first run; keep mocking up). Side brackets are a future enhancement, not in scope. Youth prizes are always SMART scholarship money, never cash.
   First real-data test: re-run the 2026-11-14 BVL Veterans doubles from scanned score sheets and compare with the official TournamentBowl results.
   Holiday Smash notes kept for later: **Sun Dec 20 2026, Lilac Lanes.** Adult/youth doubles, 9-pin no-tap,
   squads at 10 AM and 1 PM, $40 per team, prize money paid as SMART scholarships to the youth
   bowler, with adult and youth side brackets. One event and two squads make it a small first
   run. Run it on both systems side by side (TournamentBowl stays official) and compare every
   standing. Then switch.

### Holiday Smash rules (from the back of the entry form, forms/holiday-smash-entry.pdf p.2)

- 3 games, 9-pin no-tap. Doubles = 1 youth + 1 adult. A bowler may enter more than once, but
  never twice with the same partner (the entry screen must block that).
- **Handicap is per team, not per bowler:** 100% of 440 minus the team average (youth avg +
  adult avg). The system needs a "team handicap" mode next to the per-bowler one.
- **Two divisions by team average:** A = 350 and up, B = 349 and below. Standings, cash line and
  prizes are per division.
- Averages: highest 2025-26 winter league average (12+ games youth, 21+ adult); else the most
  recent highest certified average (summer counts); else 125 for women, 150 for men. The director
  can re-rate before bowling (and an adult before the end of game 1), so averages stay editable
  until a squad starts, with every change logged.
- Prizes: 1 in 3 paid entries (per division, assumed), prize fund $20 per team + $1000 added
  from the SMART account. All prize money goes to the youth bowler as SMART scholarship credit;
  adults don't cash. Division winners get jerseys. Ties = co-champions.
- Fee $40 per team ($15 bowling, $5 fees, $20 prize fund). PayPal/Venmo or check. Walk-ins allowed.

Gaps: the form doesn't say the handicap rounding (assume whole pins, drop fractions), whether
the 1:3 ratio is per division, how the prize fund splits by place, or anything about the side
brackets (fee, handicap, payout). The online entry form also has no gender field, which the
no-average rule (125 women / 150 men) needs.

### Holiday Smash timeline (5 weeks)

| By | What |
|---|---|
| Nov 22 | Answers to the Holiday Smash rule gaps; ask Lilac Lanes about its scoring system and get a sample export |
| Nov 29 | Phase 2: entries live on the board desk; online-form entries flowing in |
| Dec 6 | Phase 3: score entry + live results page, tested with a fake 40-team tournament |
| Dec 13 | House score intake (email first, sender program if Lilac's system allows); dry run with Lilac's sample file |
| Dec 20 | Pilot day |

## Decided

- Entries: Tyson and the Association Manager (2026-11-14).
- Scores: from the houses (sender program or email), plus board entry as backup (2026-11-14).
- Pilot: TBD; Holiday Smash is too complicated for a first run. Brackets: future enhancement (2026-11-14).

## Open questions (for the board / Association Manager)

1. Holiday Smash: the gaps listed under "Holiday Smash rules" above (rounding, ratio per
   division, prize split by place, side-bracket fee/handicap/payout).
2. Should the adult/youth side brackets run in this system too (bracket-live already does
   brackets), or stay on paper for the pilot?
3. Online payment: keep "pay at the house" (today's behavior) or add card payments later?
4. Prize lists: does the board want the system to figure payouts from the prize fund, or only
   show who's in the money?
5. Does anything (state association, sanction paperwork) need TournamentBowl specifically, or
   just a results report we can print?
