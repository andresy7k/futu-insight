"""Download historical match CSVs from football-data.co.uk with local caching."""
from __future__ import annotations

import io
import os
import time
from typing import List, Optional

import pandas as pd
import requests

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "storage", "cache")
CACHE_TTL_SECONDS = 24 * 60 * 60
BASE_URL = "https://www.football-data.co.uk/mmz4281/{season}/{league}.csv"


def _cache_path(league_code: str) -> str:
    os.makedirs(CACHE_DIR, exist_ok=True)
    return os.path.join(CACHE_DIR, f"{league_code}.csv")


def _cache_is_fresh(path: str) -> bool:
    if not os.path.exists(path):
        return False
    age = time.time() - os.path.getmtime(path)
    return age < CACHE_TTL_SECONDS


def _read_cache(path: str) -> Optional[pd.DataFrame]:
    try:
        if os.path.exists(path):
            return pd.read_csv(path)
    except Exception as e:
        print(f"[downloader] failed reading cache {path}: {e}")
    return None


def download_league_data(
    league_code: str,
    seasons: Optional[List[str]] = None,
) -> Optional[pd.DataFrame]:
    """Download and concatenate season CSVs for a league. Returns None on total failure."""
    seasons = seasons or ["2324", "2425", "2526"]
    path = _cache_path(league_code)

    if _cache_is_fresh(path):
        cached = _read_cache(path)
        if cached is not None and not cached.empty:
            return cached

    frames: List[pd.DataFrame] = []
    for season in seasons:
        url = BASE_URL.format(season=season, league=league_code)
        try:
            resp = requests.get(url, timeout=30)
            if resp.status_code == 200 and resp.content:
                df = pd.read_csv(io.BytesIO(resp.content), on_bad_lines="skip", encoding_errors="ignore")
                if not df.empty:
                    df["_season"] = season
                    frames.append(df)
        except Exception as e:
            print(f"[downloader] {league_code} {season} failed: {e}")

    if not frames:
        # Fall back to any existing cache regardless of age
        return _read_cache(path)

    try:
        combined = pd.concat(frames, ignore_index=True, sort=False)
        combined.to_csv(path, index=False)
        return combined
    except Exception as e:
        print(f"[downloader] concat/save failed for {league_code}: {e}")
        return _read_cache(path)