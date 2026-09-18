#!/usr/bin/env python3
"""
Export the Mens Northwest League data from the bracket-system database into
leagues-data.json, which leagues.html and team.html read client-side.

Run this after check_league_email.py picks up new weeks
(see ~/bracket-system/scripts/), then commit + push leagues-data.json.
"""

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = "/home/tyson/bracket-system/data/brackets.db"
OUT_PATH = Path(__file__).resolve().parent.parent / "leagues-data.json"

LEAGUE_INFO = {"id": 59869, "name": "Mens Northwest League", "center": "Lilac Lanes"}


def main():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    lane_week = cur.execute(
        "SELECT year, season, week_num FROM lane_assignments ORDER BY year DESC, week_num DESC LIMIT 1"
    ).fetchone()
    lanes = []
    if lane_week:
        lanes = [
            dict(r) for r in cur.execute(
                "SELECT lane_number, team_id, team_name, team_num FROM lane_assignments "
                "WHERE year = ? AND season = ? AND week_num = ? ORDER BY lane_number",
                (lane_week["year"], lane_week["season"], lane_week["week_num"]),
            ).fetchall()
        ]

    recap_rows = cur.execute(
        "SELECT year, season, week_num, team_id, team_name, lane_bowled_on, team_points_won, "
        "bowler_id, bowler_name, average, handicap, game1, game2, game3, game4, game5, game6, "
        "total, handicap_total FROM weekly_recaps ORDER BY team_id, week_num, id"
    ).fetchall()

    teams = {}
    for r in recap_rows:
        tid = r["team_id"]
        if tid not in teams:
            teams[tid] = {"team_id": tid, "team_name": r["team_name"], "weeks": {}}
        wk = str(r["week_num"])
        week = teams[tid]["weeks"].setdefault(wk, {
            "year": r["year"], "season": r["season"], "week_num": r["week_num"],
            "lane_bowled_on": r["lane_bowled_on"], "points_won": r["team_points_won"],
            "bowlers": [],
        })
        games = [g for g in (r["game1"], r["game2"], r["game3"], r["game4"], r["game5"], r["game6"]) if g]
        name = r["bowler_name"].lstrip(", ") or "Vacant"
        week["bowlers"].append({
            "name": name, "average": r["average"], "handicap": r["handicap"],
            "games": games, "total": r["total"], "handicap_total": r["handicap_total"],
        })

    data = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "league": LEAGUE_INFO,
        "lane_assignments": {
            "year": lane_week["year"] if lane_week else None,
            "season": lane_week["season"] if lane_week else None,
            "week_num": lane_week["week_num"] if lane_week else None,
            "lanes": lanes,
        },
        "teams": sorted(teams.values(), key=lambda t: t["team_name"]),
    }

    OUT_PATH.write_text(json.dumps(data, indent=2))
    print(f"Wrote {OUT_PATH} — {len(teams)} teams, weeks per team: "
          f"{sorted(set(w for t in teams.values() for w in t['weeks']))}")


if __name__ == "__main__":
    main()
