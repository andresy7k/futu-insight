"""Feature engineering for match prediction models."""
from __future__ import annotations

import difflib
from typing import List, Optional, Tuple

import numpy as np
import pandas as pd

REQUIRED_COLS = [
    "HomeTeam", "AwayTeam", "FTR", "FTHG", "FTAG",
    "HS", "AS", "HST", "AST", "B365H", "B365D", "B365A",
]

RESULT_TO_LABEL = {"H": 0, "D": 1, "A": 2}


def _prepare(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    # Keep only rows with required cols present
    for col in REQUIRED_COLS:
        if col not in df.columns:
            df[col] = np.nan
    # Parse date if present for chronological ordering
    if "Date" in df.columns:
        df["Date"] = pd.to_datetime(df["Date"], dayfirst=True, errors="coerce")
        df = df.sort_values("Date").reset_index(drop=True)
    df = df.dropna(subset=["HomeTeam", "AwayTeam", "FTR"]).reset_index(drop=True)
    return df


def _team_recent(df: pd.DataFrame, team: str, upto_idx: int, n: int = 5) -> pd.DataFrame:
    past = df.iloc[:upto_idx]
    mask = (past["HomeTeam"] == team) | (past["AwayTeam"] == team)
    return past[mask].tail(n)


def _team_stats(matches: pd.DataFrame, team: str) -> dict:
    if matches.empty:
        return {
            "avg_goals_scored": 0.0, "avg_goals_conceded": 0.0,
            "avg_shots": 0.0, "avg_shots_on_target": 0.0,
            "win_rate": 0.0, "form_points": 0.0,
        }
    goals_for, goals_against = [], []
    shots, sot = [], []
    wins, points = 0, 0
    for _, r in matches.iterrows():
        is_home = r["HomeTeam"] == team
        gf = r["FTHG"] if is_home else r["FTAG"]
        ga = r["FTAG"] if is_home else r["FTHG"]
        sh = r["HS"] if is_home else r["AS"]
        st = r["HST"] if is_home else r["AST"]
        goals_for.append(gf); goals_against.append(ga)
        if pd.notna(sh): shots.append(sh)
        if pd.notna(st): sot.append(st)
        res = r["FTR"]
        if (res == "H" and is_home) or (res == "A" and not is_home):
            wins += 1; points += 3
        elif res == "D":
            points += 1
    n = len(matches)
    return {
        "avg_goals_scored": float(np.nanmean(goals_for)) if goals_for else 0.0,
        "avg_goals_conceded": float(np.nanmean(goals_against)) if goals_against else 0.0,
        "avg_shots": float(np.mean(shots)) if shots else 0.0,
        "avg_shots_on_target": float(np.mean(sot)) if sot else 0.0,
        "win_rate": wins / n,
        "form_points": points / (n * 3),
    }


def _h2h_stats(df: pd.DataFrame, home: str, away: str, upto_idx: int, n: int = 5) -> dict:
    past = df.iloc[:upto_idx]
    mask = (
        ((past["HomeTeam"] == home) & (past["AwayTeam"] == away)) |
        ((past["HomeTeam"] == away) & (past["AwayTeam"] == home))
    )
    meetings = past[mask].tail(n)
    if meetings.empty:
        return {"h2h_home_win_rate": 0.5, "h2h_avg_goals": 2.5}
    home_wins = 0
    goals = []
    for _, r in meetings.iterrows():
        total = (r["FTHG"] or 0) + (r["FTAG"] or 0)
        goals.append(total)
        if r["HomeTeam"] == home and r["FTR"] == "H":
            home_wins += 1
        elif r["AwayTeam"] == home and r["FTR"] == "A":
            home_wins += 1
    return {
        "h2h_home_win_rate": home_wins / len(meetings),
        "h2h_avg_goals": float(np.mean(goals)) if goals else 2.5,
    }


def _row_features(df: pd.DataFrame, idx: int, home: str, away: str) -> Optional[List[float]]:
    home_matches = _team_recent(df, home, idx)
    away_matches = _team_recent(df, away, idx)
    if len(home_matches) < 3 or len(away_matches) < 3:
        return None
    hs = _team_stats(home_matches, home)
    as_ = _team_stats(away_matches, away)
    h2h = _h2h_stats(df, home, away, idx)
    row = df.iloc[idx] if idx < len(df) else None
    if row is not None:
        home_odds = row.get("B365H"); draw_odds = row.get("B365D"); away_odds = row.get("B365A")
    else:
        home_odds = draw_odds = away_odds = np.nan
    if pd.isna(home_odds) or pd.isna(draw_odds) or pd.isna(away_odds):
        return None
    return [
        hs["avg_goals_scored"], hs["avg_goals_conceded"], hs["avg_shots"],
        hs["avg_shots_on_target"], hs["win_rate"], hs["form_points"],
        as_["avg_goals_scored"], as_["avg_goals_conceded"], as_["avg_shots"],
        as_["avg_shots_on_target"], as_["win_rate"], as_["form_points"],
        h2h["h2h_home_win_rate"], h2h["h2h_avg_goals"],
        float(home_odds), float(draw_odds), float(away_odds),
    ]


def build_features(df: pd.DataFrame, home_team: str, away_team: str) -> Optional[List[float]]:
    """Build the feature vector for a NEW upcoming match between home_team and away_team."""
    df = _prepare(df)
    # Use idx=len(df) so we look at ALL historical matches
    return _row_features(df, len(df), home_team, away_team)


def get_training_data(df: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
    df = _prepare(df)
    X, y = [], []
    for idx in range(len(df)):
        row = df.iloc[idx]
        feats = _row_features(df, idx, row["HomeTeam"], row["AwayTeam"])
        if feats is None:
            continue
        label = RESULT_TO_LABEL.get(row["FTR"])
        if label is None:
            continue
        X.append(feats); y.append(label)
    return np.array(X, dtype=float), np.array(y, dtype=int)


def known_teams(df: pd.DataFrame) -> List[str]:
    df = _prepare(df)
    teams = pd.unique(pd.concat([df["HomeTeam"], df["AwayTeam"]], ignore_index=True).dropna())
    return [str(t) for t in teams]


def normalize_team_name(name: str, known: List[str]) -> Optional[str]:
    if not name:
        return None
    cleaned = " ".join(str(name).strip().split()).title()
    if cleaned in known:
        return cleaned
    # Try case-insensitive exact
    for t in known:
        if t.lower() == cleaned.lower():
            return t
    matches = difflib.get_close_matches(cleaned, known, n=1, cutoff=0.6)
    return matches[0] if matches else None