"""Cuotas con degradación segura: Betano/OddsPapi y The Odds API como respaldo."""
from __future__ import annotations

import os
import re
import unicodedata
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher

import requests
from dotenv import load_dotenv
from pathlib import Path

for directory in Path(__file__).resolve().parents:
    load_dotenv(directory / ".env")

ODDSPAPI_BASE = "https://api.oddspapi.io/v4"
ODDS_API_BASE = "https://api.the-odds-api.com/v4"
ODDS_API_SPORTS = {
    "ES": "soccer_spain_la_liga", "SP1": "soccer_spain_la_liga",
    "E0": "soccer_epl", "I1": "soccer_italy_serie_a",
    "F1": "soccer_france_ligue_one", "D1": "soccer_germany_bundesliga",
    "BR": "soccer_brazil_campeonato", "ARG": "soccer_argentina_primera_division",
}
ALIASES = {"lacoruna": ("rcdeportivodeacoruna", "deportivolacoruna"), "vallecano": ("rayovallecano",), "alaves": ("deportivoalaves",), "oviedo": ("realoviedo",)}


def _norm(value: object) -> str:
    value = unicodedata.normalize("NFKD", str(value).lower()).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", value)


def _score(local: str, provider: str) -> float:
    a, b = _norm(local), _norm(provider)
    return max(1.0 if item in b or b in item else SequenceMatcher(None, item, b).ratio() for item in (a, *ALIASES.get(a, ())))


def _odds_papi(home: str, away: str, days: int) -> tuple[list[dict], str | None]:
    key = os.getenv("ODDSPAPI_API_KEY")
    if not key:
        return [], "OddsPapi sin configurar"
    now = datetime.now(timezone.utc)
    params = {"apiKey": key, "sportId": 10, "from": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "to": (now + timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")}
    response = requests.get(f"{ODDSPAPI_BASE}/fixtures", params=params, timeout=12)
    response.raise_for_status()
    raw = response.json(); fixtures = raw.get("data", raw) if isinstance(raw, dict) else raw
    candidates = [(_score(home, item.get("participant1Name", "")), _score(away, item.get("participant2Name", "")), item) for item in fixtures]
    candidates = [item for item in candidates if item[0] >= .72 and item[1] >= .72]
    if not candidates:
        return [], "Fixture Betano no encontrado"
    fixture = max(candidates, key=lambda item: item[0] + item[1])[2]
    response = requests.get(f"{ODDSPAPI_BASE}/odds", params={"apiKey": key, "fixtureId": fixture["fixtureId"], "bookmakers": "betano", "language": "en", "verbosity": 3}, timeout=12)
    response.raise_for_status()
    book = response.json().get("bookmakerOdds", {}).get("betano", {})
    if not book or book.get("suspended"):
        return [], "Betano no tiene cuotas activas"
    response = requests.get(f"{ODDSPAPI_BASE}/markets", params={"apiKey": key, "sportId": 10}, timeout=12)
    response.raise_for_status()
    raw = response.json(); catalog_rows = raw.get("data", raw) if isinstance(raw, dict) else raw
    catalog = {str(item.get("marketId")): item for item in catalog_rows}
    result: list[dict] = []
    for market_id, market in book.get("markets", {}).items():
        spec = catalog.get(str(market_id), {})
        outcomes = {str(item.get("outcomeId")): str(item.get("outcomeName", "")) for item in spec.get("outcomes", [])}
        for outcome_id, outcome in market.get("outcomes", {}).items():
            for selection in outcome.get("players", {}).values():
                price = selection.get("price")
                if selection.get("active", True) and isinstance(price, (int, float)) and price > 1:
                    result.append({"market": str(spec.get("marketName", market_id)), "type": str(spec.get("marketType", "")), "line": spec.get("handicap"), "selection": outcomes.get(str(outcome_id), str(selection.get("bookmakerOutcomeId", ""))), "odds": float(price), "source": "Betano"})
    return result, None


def _the_odds_api(home: str, away: str, league: str | None) -> tuple[list[dict], str | None]:
    key = os.getenv("ODDS_API_KEY") or os.getenv("THE_ODDS_API_KEY")
    sport = ODDS_API_SPORTS.get((league or "").upper())
    if not key:
        return [], "The Odds API sin configurar"
    if not sport:
        return [], f"The Odds API no tiene mapeo de liga para {league or 'este partido'}"
    response = requests.get(f"{ODDS_API_BASE}/sports/{sport}/odds", params={"apiKey": key, "regions": "eu", "markets": "h2h,totals,spreads", "oddsFormat": "decimal", "dateFormat": "iso"}, timeout=12)
    response.raise_for_status()
    events = response.json()
    matches = [((_score(home, event.get("home_team", "")) + _score(away, event.get("away_team", ""))) / 2, event) for event in events]
    if not matches or max(matches, key=lambda item: item[0])[0] < .72:
        return [], "The Odds API no encontró el fixture"
    event = max(matches, key=lambda item: item[0])[1]
    best: dict[tuple[str, str, float | None], dict] = {}
    for bookmaker in event.get("bookmakers", []):
        source = str(bookmaker.get("title", "The Odds API"))
        for market in bookmaker.get("markets", []):
            kind = market.get("key")
            for outcome in market.get("outcomes", []):
                price = outcome.get("price")
                if not isinstance(price, (int, float)) or price <= 1:
                    continue
                name, point = str(outcome.get("name", "")), outcome.get("point")
                if kind == "h2h":
                    selection = "home" if _score(home, name) >= .8 else "away" if _score(away, name) >= .8 else "draw" if _norm(name) in {"draw", "tie"} else None
                    item = {"market": "1X2", "type": "1x2", "line": None, "selection": selection, "odds": float(price), "source": source} if selection else None
                elif kind == "totals" and isinstance(point, (int, float)):
                    item = {"market": "Total Goals", "type": "totals", "line": float(point), "selection": name.lower(), "odds": float(price), "source": source}
                elif kind == "spreads" and isinstance(point, (int, float)):
                    selection = "home" if _score(home, name) >= .8 else "away" if _score(away, name) >= .8 else None
                    item = {"market": "Asian Handicap", "type": "handicap", "line": float(point), "selection": selection, "odds": float(price), "source": source, "line_for_selection": True} if selection else None
                else:
                    item = None
                if item:
                    identifier = (item["market"], item["selection"], item["line"])
                    if identifier not in best or item["odds"] > best[identifier]["odds"]:
                        best[identifier] = item
    return list(best.values()), None if best else "The Odds API no devolvió mercados utilizables"


def markets(home: str, away: str, league: str | None = None, days: int = 7) -> tuple[list[dict], str | None]:
    """Betano primero; si falla, devuelve mercados compatibles de The Odds API."""
    try:
        result, error = _odds_papi(home, away, days)
        if result:
            return result, None
    except (requests.RequestException, ValueError, KeyError) as exc:
        error = f"OddsPapi: {exc}"
    try:
        fallback, fallback_error = _the_odds_api(home, away, league)
        if fallback:
            return fallback, f"Betano no disponible ({error}); usando The Odds API"
        return [], f"Betano: {error}. Respaldo: {fallback_error}"
    except (requests.RequestException, ValueError, KeyError) as exc:
        return [], f"Betano: {error}. The Odds API: {exc}"
