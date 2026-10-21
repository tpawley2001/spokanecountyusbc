#!/usr/bin/env python3
"""Build the BVL collection sign-up sheet (bvl-data/bvl-signup.json, read by
bvl.js) from the board's spreadsheet.

The spreadsheet's "Assignments" sheet has a header row (House, Day, Session,
Arrive by, Leagues bowling, Director, Phone / email, Date collected, Amount
collected, Notes) followed by one row per league visit. Values are copied as
they are; nothing is corrected. The Phone / email column is left out: the
online sheet takes names only.

The output holds directors' names and amounts: write it outside the
repository (which is public) and copy it to the server's bvl-data/ directory.

    python3 scripts/seed_bvl_signup.py SIGNUP.xlsx OUT.json
"""
import datetime
import json
import secrets
import sys

import openpyxl

COLUMNS = {
    "House": "house", "Day": "day", "Session": "session", "Arrive by": "arrive",
    "Leagues bowling (start time)": "leagues", "Director (sign up)": "director",
    "Date collected": "date_collected",
    "Amount collected": "amount", "Notes": "notes",
}


def text(v):
    if v is None:
        return ""
    if isinstance(v, datetime.datetime):
        return v.date().isoformat()
    if isinstance(v, datetime.date):
        return v.isoformat()
    if isinstance(v, float):
        return f"{v:.2f}"
    return str(v).strip()


def main(src, out):
    ws = openpyxl.load_workbook(src, data_only=True)["Assignments"]
    rows = list(ws.iter_rows(values_only=True))
    header_at = next(i for i, r in enumerate(rows) if r and r[0] == "House")
    header = [text(c) for c in rows[header_at]]
    missing = [h for h in COLUMNS if h not in header]
    if missing:
        sys.exit(f"columns not found: {missing}")
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    slots = []
    for r in rows[header_at + 1:]:
        row = {COLUMNS[h]: text(r[header.index(h)]) for h in COLUMNS}
        if not row["house"] or row["house"] == "TOTAL":
            continue
        slots.append({"id": secrets.token_hex(6), **row, "version": 1, "updated_at": now})
    with open(out, "w") as f:
        json.dump({"title": text(rows[0][0]), "source": src.rsplit("/", 1)[-1], "seeded_at": now,
                   "slots": slots}, f, indent=2)
    print(f"{len(slots)} visits, {sum(1 for s in slots if s['director'])} signed up -> {out}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
