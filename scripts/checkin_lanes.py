#!/usr/bin/env python3
"""Set lanes on the check-in desk (checkin.js) from a lane-assignment sheet.

Meant for the photo-of-the-lane-sheet workflow: read the sheet, write down
which bowlers or team is on which lane, and let this script match those names
to the roster's teams and save them. It talks to the box over the LAN
(http://10.0.20.10/api/checkin, no Cloudflare sign-in needed).

    checkin_lanes.py --list                      # every team: id, name, bowlers, current lane
    checkin_lanes.py --set "12=Avila Sword" "13=Balls of Duty"
    checkin_lanes.py --file lanes.txt            # one "LANE = names" per line
    ... --apply                                  # save (without it: dry run, prints the plan)
    checkin_lanes.py --photo sheet.jpg [--apply] # also add the photo to the page

Each "LANE = names" entry names a team by its team name or by bowlers' last
names (first names help when a last name repeats), e.g. "7 = Condon / Matherly"
or "7 = Doug Condon". An entry only applies when exactly one team matches
best; anything unmatched or ambiguous is listed and skipped, never guessed.
"""
import argparse
import json
import re
import sys
import urllib.request

BASE = 'http://10.0.20.10/api/checkin'


def req(path, data=None, ctype='application/json', method=None):
    body = data if isinstance(data, (bytes, type(None))) else json.dumps(data).encode()
    r = urllib.request.Request(f'{BASE}/{path}', data=body, method=method,
                               headers={'Content-Type': ctype} if body is not None else {})
    with urllib.request.urlopen(r, timeout=20) as resp:
        return json.load(resp)


def norm(s):
    return re.sub(r'[^a-z0-9 ]+', ' ', s.lower()).split()


def label(t):
    return t['name'] or ' / '.join(b['l'] for b in t['b'])


def score(team, words):
    """How well the words name this team; 0 = not at all."""
    if team['name'] and norm(team['name']) == words:
        return 100
    last = {w for b in team['b'] for w in norm(b['l'] + ' ' + b.get('s', ''))}
    first = {w for b in team['b'] for w in norm(b['f'])}
    hits = 0
    for w in words:
        if w in last:
            hits += 3
        elif w in first:
            hits += 1
        elif w not in ('and', 'vs', 'lane'):
            return 0          # a word that belongs to nobody on this team
    return hits


def parse(entry):
    m = re.match(r'^\s*([\w\-]{1,8})\s*[=:]\s*(.+)$', entry)
    if not m:
        sys.exit(f'Not "LANE = names": {entry!r}')
    return m.group(1), norm(m.group(2))


def main():
    global BASE
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--list', action='store_true')
    ap.add_argument('--set', nargs='*', default=[])
    ap.add_argument('--file')
    ap.add_argument('--photo', nargs='*', default=[])
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--base', default=BASE)
    a = ap.parse_args()
    BASE = a.base.rstrip('/')

    roster = req('roster')
    state = req('state')
    teams = roster['teams']
    lane_of = lambda t: state['lanes'].get('t' + t['id']) or next((str(b['lane']) for b in t['b'] if b.get('lane')), '')

    if a.list:
        for t in sorted(teams, key=label):
            names = ', '.join(f"{b['f']} {b['l']}" for b in t['b'])
            print(f"{t['id']:>8}  lane {lane_of(t) or '-':>4}  {label(t)}  [{names}]")
        print(f"{len(teams)} teams · {roster['event']['name']} · {roster['event']['squad']}")

    entries = list(a.set)
    if a.file:
        entries += [l for l in open(a.file) if l.strip() and not l.lstrip().startswith('#')]
    plan, problems = [], []
    for e in entries:
        lane, words = parse(e)
        scored = sorted(((score(t, words), t) for t in teams), key=lambda x: -x[0])
        best = [t for s, t in scored if s and s == scored[0][0]]
        if not best:
            problems.append(f'NO MATCH   {e.strip()}')
        elif len(best) > 1:
            problems.append(f'AMBIGUOUS  {e.strip()}  ->  ' + ' | '.join(label(t) for t in best))
        else:
            plan.append((lane, best[0]))
    seen = {}
    for lane, t in plan:
        if t['id'] in seen and seen[t['id']] != lane:
            problems.append(f"CONFLICT   {label(t)} given lanes {seen[t['id']]} and {lane}")
        seen[t['id']] = lane

    for lane, t in plan:
        old = lane_of(t)
        print(f"lane {lane:>4}  {label(t)}" + (f'  (was {old})' if old and old != lane else ''))
    for p in problems:
        print(p)
    if plan or a.photo:
        missing = [label(t) for t in teams if t['id'] not in seen and not lane_of(t)]
        if entries:
            print(f'{len(plan)} matched, {len(problems)} problems, {len(missing)} teams still without a lane'
                  + (': ' + '; '.join(missing) if 0 < len(missing) <= 12 else ''))

    if not a.apply:
        if plan or a.photo:
            print('Dry run: nothing saved. Add --apply to save.')
        return
    for lane, t in plan:
        if not any(p.startswith('CONFLICT') and label(t) in p for p in problems):
            req('lane/' + t['id'], {'lane': lane})
    for path in a.photo:
        ext = path.lower().rsplit('.', 1)[-1]
        ctype = {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'webp': 'image/webp'}.get(ext)
        if not ctype:
            sys.exit(f'{path}: use a JPEG, PNG or WebP photo')
        with open(path, 'rb') as f:
            req('photo', f.read(), ctype)
        print(f'photo added: {path}')
    print(f'Saved {len(plan)} lanes.')


if __name__ == '__main__':
    main()
