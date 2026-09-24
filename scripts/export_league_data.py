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
LEAGUES_OUT = Path(__file__).resolve().parent.parent / "leagues"
PHOTO_LEAGUES_DIR = Path("/home/tyson/bracket-system/data/leagues")

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

    # ── Multi-league files: leagues/index.json + leagues/<slug>.json ──
    LEAGUES_OUT.mkdir(exist_ok=True)
    mnw = {**data, "league": {**LEAGUE_INFO, "slug": "mens-northwest", "day_time": "Thursday 6:00 pm",
                              "scoring": "handicap", "source": "League Secretary / BLS recap sheets"}}
    index = [{"slug": "mens-northwest", "name": LEAGUE_INFO["name"], "center": LEAGUE_INFO["center"],
              "day_time": "Thursday 6:00 pm"}]
    (LEAGUES_OUT / "mens-northwest.json").write_text(json.dumps(mnw, indent=2))
    for league in photo_leagues():
        (LEAGUES_OUT / f"{league['league']['slug']}.json").write_text(json.dumps(league, indent=2, ensure_ascii=False))
        index.append({k: league["league"].get(k) for k in ("slug", "name", "center", "day_time")})
        print(f"Wrote leagues/{league['league']['slug']}.json — {len(league['teams'])} teams, "
              f"through week {league['as_of']['week']}")
    (LEAGUES_OUT / "index.json").write_text(json.dumps({"generated_at": data["generated_at"], "leagues": index}, indent=2))


def photo_leagues():
    """Leagues read from recap-sheet photos (bracket-system/data/leagues/<slug>/week-NN.json)."""
    cfg_path = PHOTO_LEAGUES_DIR / "leagues.json"
    if not cfg_path.exists():
        return []
    out = []
    for short, cfg in json.loads(cfg_path.read_text()).items():
        weeks = sorted((PHOTO_LEAGUES_DIR / cfg["slug"]).glob("week-*.json"))
        if not weeks:
            continue
        recs = [json.loads(w.read_text()) for w in weeks]
        latest = recs[-1]
        teams = {}
        for rec in recs:
            for tid, res in rec["results"].items():
                t = teams.setdefault(int(tid), {"team_id": int(tid), "team_name": rec["team_names"].get(tid, f"Team {tid}"), "weeks": {}})
                t["team_name"] = rec["team_names"].get(tid, t["team_name"])
                t["weeks"][str(rec["week"])] = {"week_num": rec["week"], "lane_bowled_on": res["lane_bowled_on"],
                                                "points_won": res["points_won"], "bowlers": res["bowlers"]}
        upcoming = min((int(w) for w in latest["lane_assignments"] if int(w) > latest["week"]), default=None)
        la = latest["lane_assignments"].get(str(upcoming), {}) if upcoming else {}
        out.append({
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "league": {"slug": cfg["slug"], "name": cfg["name"], "short_name": short, "center": cfg.get("center"),
                       "day_time": latest.get("day_time"), "lanes": latest.get("lanes"),
                       "total_weeks": latest.get("total_weeks"), "scoring": cfg.get("scoring", "scratch"),
                       "source": "BLS recap sheet photos"},
            "as_of": {"week": latest["week"], "date": latest["date"]},
            "standings": latest["standings"],
            "lane_assignments": {"week_num": upcoming, "date": la.get("date"),
                                 "lanes": sorted(la.get("lanes", []), key=lambda l: l["lane_number"])},
            "teams": sorted(teams.values(), key=lambda t: t["team_id"]),
        })
    return out


if __name__ == "__main__":
    main()
