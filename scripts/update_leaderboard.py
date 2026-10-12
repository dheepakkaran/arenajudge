#!/usr/bin/env python3
"""Fetch the Kaggle public leaderboard and our own submissions, write data/leaderboard.json.

Runs daily in GitHub Actions (.github/workflows/update-leaderboard.yml).
Needs Kaggle credentials in the environment, stored as GitHub repository secrets:
either KAGGLE_API_TOKEN (new-style API token) or KAGGLE_USERNAME + KAGGLE_KEY (legacy kaggle.json).
Never commit credentials. CLI flags checked against kaggle 2.2.4 (pinned in the workflow).

The competition's leaderboard is rolling (last 2 months of submissions), so the team can drop off.
In that case the last known rank is kept and on_leaderboard is set to false.
"""
import csv, glob, io, json, os, subprocess, sys, tempfile, zipfile
from datetime import datetime, timezone

COMP = os.getenv("KAGGLE_COMPETITION", "llm-classification-finetuning")
TEAM = os.getenv("KAGGLE_TEAM_NAME", "Dk")
OUT = os.getenv("LEADERBOARD_OUT", "data/leaderboard.json")
LOWER_IS_BETTER = True          # metric is log loss
MAX_HISTORY = 400


def kaggle(*args):
    """Run the Kaggle CLI and return stdout. Raises with the CLI's message on failure."""
    r = subprocess.run(["kaggle", *args], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"kaggle {' '.join(args)} failed:\n{r.stderr or r.stdout}")
    return r.stdout


def pick(row, *names):
    """Read a column whatever its exact header (Kaggle has renamed columns over time)."""
    lower = {k.strip().lower().replace(" ", "").replace("_", ""): v for k, v in row.items() if k}
    for n in names:
        v = lower.get(n.lower().replace(" ", "").replace("_", ""))
        if v not in (None, ""):
            return v
    return None


def to_float(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def fetch_leaderboard_rows():
    """Download the full public leaderboard (zip with one CSV) and return its rows."""
    with tempfile.TemporaryDirectory() as d:
        kaggle("competitions", "leaderboard", COMP, "--download", "--path", d)
        rows = []
        for f in glob.glob(os.path.join(d, "*")):
            if f.endswith(".zip"):
                with zipfile.ZipFile(f) as z:
                    for name in z.namelist():
                        if name.endswith(".csv"):
                            rows += list(csv.DictReader(io.TextIOWrapper(z.open(name), encoding="utf-8")))
            elif f.endswith(".csv"):
                with open(f, encoding="utf-8") as fh:
                    rows += list(csv.DictReader(fh))
        return rows


def rank_teams(rows):
    """One entry per team (best score), sorted best first, with ranks."""
    best = {}
    for r in rows:
        name = pick(r, "TeamName", "team")
        score = to_float(pick(r, "Score", "PublicScore"))
        if name is None or score is None:
            continue
        key = pick(r, "TeamId") or name
        given_rank = pick(r, "Rank")
        cur = best.get(key)
        better = cur is None or (score < cur["score"] if LOWER_IS_BETTER else score > cur["score"])
        if better:
            best[key] = {"team": name, "score": score, "given_rank": int(given_rank) if str(given_rank or "").isdigit() else None}
    teams = sorted(best.values(), key=lambda t: t["score"], reverse=not LOWER_IS_BETTER)
    for i, t in enumerate(teams, 1):
        t["rank"] = t.pop("given_rank") or i
    return teams


def histogram(scores, lo=None, hi=None, bins=24):
    """Score distribution for a chart. Clipped to a readable range around the pack."""
    s = sorted(scores)
    if not s:
        return None
    lo = s[0] if lo is None else lo
    hi = s[int(len(s) * 0.95) - 1] if hi is None and len(s) > 20 else (s[-1] if hi is None else hi)
    if hi <= lo:
        hi = lo + 1e-6
    width = (hi - lo) / bins
    counts = [0] * bins
    for x in s:
        if lo <= x <= hi:
            counts[min(int((x - lo) / width), bins - 1)] += 1
    return {"edges": [round(lo + i * width, 5) for i in range(bins + 1)], "counts": counts}


def fetch_submissions():
    """Our team's own submissions (needs to be a team member's credentials)."""
    try:
        out = kaggle("competitions", "submissions", COMP, "-v")      # -v = CSV output
    except RuntimeError as e:
        print("warning: could not read submissions:", e, file=sys.stderr)
        return []
    subs = []
    for r in csv.DictReader(io.StringIO(out)):
        score = to_float(pick(r, "publicScore", "public_score", "PublicScore"))
        status = (pick(r, "status") or "").lower()
        if score is None or ("complete" not in status and status):
            continue
        subs.append({"date": (pick(r, "date") or "")[:19], "score": score,
                     "description": (pick(r, "description") or "")[:140]})
    subs.sort(key=lambda s: s["date"])
    return subs


def main():
    prev = {}
    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as fh:
            prev = json.load(fh)
    now = datetime.now(timezone.utc)

    teams = rank_teams(fetch_leaderboard_rows())
    if not teams:
        raise SystemExit("leaderboard download returned no rows; keeping the previous file")
    me = next((t for t in teams if t["team"] == TEAM), None)
    my_i = teams.index(me) if me else None

    data = {
        "_note": "Written by scripts/update_leaderboard.py (GitHub Actions, daily).",
        "source": "kaggle-cli",
        "competition": COMP,
        "team": TEAM,
        "updated_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "on_leaderboard": me is not None,
        "rank": me["rank"] if me else prev.get("rank"),
        "teams": len(teams),
        "teams_approx": False,
        "score": me["score"] if me else prev.get("score"),
        "top_percent": round(100 * me["rank"] / len(teams), 1) if me else prev.get("top_percent"),
        "leader_score": teams[0]["score"],
        "neighbors": teams[max(0, my_i - 3): my_i + 4] if me else [],
        "histogram": histogram([t["score"] for t in teams]),
        "submissions": fetch_submissions() or prev.get("submissions", []),
        "history": [h for h in prev.get("history", [])],
    }
    if not me:
        data["note"] = "Team not on the rolling leaderboard right now; rank and score are the last known values."

    today = now.strftime("%Y-%m-%d")
    entry = {"date": today, "rank": data["rank"], "score": data["score"], "teams": data["teams"],
             "on_leaderboard": data["on_leaderboard"], "source": "kaggle-cli"}
    data["history"] = [h for h in data["history"] if h.get("date") != today or h.get("source") == "manual"]
    data["history"].append(entry)
    data["history"] = data["history"][-MAX_HISTORY:]

    os.makedirs(os.path.dirname(OUT) or ".", exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)
    print(f"{TEAM}: rank {data['rank']} of {data['teams']}, score {data['score']}, on leaderboard: {data['on_leaderboard']}")


if __name__ == "__main__":
    main()
