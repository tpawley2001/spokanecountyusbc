#!/usr/bin/env python3
"""Turn a TournamentBowl "Tournament Roster" export into checkin-data/roster.json
for the check-in page (checkin.js).

    scripts/checkin_import.py "TournamentRoster (6).xls" [-o checkin-data/roster.json] [--reset]

The export is an old-style .xls; it is converted to CSV with LibreOffice
(soffice), so run this on a machine that has it, then copy roster.json to the
box. A .csv export works too. --reset also moves the old check-in state aside
(state.json -> state-<time>.json) so a new tournament starts with nobody
checked in. Bowlers are grouped by TEAM (pairs for doubles, five for team
events); a team with no name shows the bowlers' last names on the page.
"""
import argparse
import csv
import datetime
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile


def read_rows(src):
    if src.lower().endswith('.csv'):
        with open(src, newline='', encoding='utf-8-sig') as f:
            return list(csv.DictReader(f))
    with tempfile.TemporaryDirectory() as tmp:
        local = os.path.join(tmp, 'roster.xls')
        shutil.copy(src, local)
        # 76 = UTF-8; the trailing flags keep text as-is
        subprocess.run(['soffice', '--headless', '--convert-to',
                        'csv:Text - txt - csv (StarCalc):44,34,76,1,,0,false,true,false,false,false',
                        '--outdir', tmp, local], check=True, capture_output=True)
        with open(os.path.join(tmp, 'roster.csv'), newline='', encoding='utf-8') as f:
            return list(csv.DictReader(f))


def build(rows):
    if not rows:
        sys.exit('The roster is empty.')
    teams = {}
    for r in rows:
        m = re.match(r'^(.*?)\s*(\d+)$', (r.get('TEAM') or '').strip())
        name, tid = (m.group(1).strip(), m.group(2)) if m else ('', 'x' + r['ID_ENTRIES_EVENTS_BOWLERS'])
        last, suffix = r['LNAME'].strip(), ''
        if ', ' in last:                       # "Kleinknecht, Sr"
            last, suffix = last.split(', ', 1)
        usbc = r['USBCNUMBER'].strip()
        if re.search(r'_\d+$', usbc):          # TournamentBowl's placeholder when there is no USBC #
            usbc = ''
        team = teams.setdefault(tid, {'id': tid, 'name': name, 'b': []})
        team['name'] = team['name'] or name
        team['b'].append({
            'e': int(r['ID_ENTRIES_EVENTS_BOWLERS']), 'u': int(r['ID_USER']),
            'f': r['FNAME'].strip(), 'l': last, 's': suffix,
            'p': int(r['POSITION'] or 0), 'avg': int(float(r['GAME_AVERAGE'] or 0)),
            'hc': int(float(r['GAME_HDCP'] or 0)), 'usbc': usbc,
            'paid': r['PAID_FULLYN'].strip().upper() == 'Y',
            'lane': int(r['LANE'] or 0),
        })
    for t in teams.values():
        t['b'].sort(key=lambda b: b['p'])
    first = rows[0]
    size = max(len(t['b']) for t in teams.values())
    return {
        'event': {
            'name': first['LONGNAME'].strip(),
            'squad': first['SQUAD_STRING'].strip(),
            'start': first['SQUAD'].strip(),
            'kind': {1: 'Singles', 2: 'Doubles'}.get(size, 'Team'),
        },
        'imported': datetime.datetime.now().isoformat(timespec='seconds'),
        'teams': list(teams.values()),
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('src')
    ap.add_argument('-o', '--out', default=os.path.join(os.path.dirname(__file__), '..', 'checkin-data', 'roster.json'))
    ap.add_argument('--reset', action='store_true', help='start a fresh check-in state')
    a = ap.parse_args()
    roster = build(read_rows(a.src))
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, 'w') as f:
        json.dump(roster, f, separators=(',', ':'))
    if a.reset:
        state = os.path.join(os.path.dirname(os.path.abspath(a.out)), 'state.json')
        if os.path.exists(state):
            os.rename(state, state.replace('.json', datetime.datetime.now().strftime('-%Y%m%d-%H%M%S.json')))
    n = sum(len(t['b']) for t in roster['teams'])
    print(f"{roster['event']['name']} · {roster['event']['squad']}: {n} entries in {len(roster['teams'])} teams -> {a.out}")


if __name__ == '__main__':
    main()
