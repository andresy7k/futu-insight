"""Adaptador OddsPapi/Betano; las credenciales nunca llegan al navegador."""
from __future__ import annotations

import os
import re
import unicodedata
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher

import requests
from dotenv import load_dotenv

# Busca .env en el servicio y en sus directorios padre durante desarrollo local.
# Los Secrets de Railway tienen precedencia y no se sobrescriben.
load_dotenv()

BASE = "https://api.oddspapi.io/v4"
ALIASES = {
    "lacoruna": ("rcdeportivodeacoruna", "deportivolacoruna"),
    "villarreal": ("villarrealcf",),
    "vallecano": ("rayovallecano",),
    "alaves": ("deportivoalaves",),
    "oviedo": ("realoviedo",),
    "mallorca": ("rcdmallorca",),
}


def _norm(value: object) -> str:
    normalized = unicodedata.normalize("NFKD", str(value).lower()).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", normalized)


def _score(local: str, provider: str) -> float:
    local_norm, provider_norm = _norm(local), _norm(provider)
    return max(
        1.0 if candidate in provider_norm or provider_norm in candidate else SequenceMatcher(None, candidate, provider_norm).ratio()
        for candidate in (local_norm, *ALIASES.get(local_norm, ()))
    )


def markets(home: str, away: str, days: int = 7) -> tuple[list[dict], str | None]:
    """Devuelve todas las cuotas activas de Betano o un error apto para interfaz."""
    key = os.getenv("ODDSPAPI_API_KEY")
    if not key:
        return [], "ODDSPAPI_API_KEY no configurada"
    try:
        now = datetime.now(timezone.utc)
        params = {
            "apiKey": key,
            "sportId": 10,
            "from": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "to": (now + timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        response = requests.get(f"{BASE}/fixtures", params=params, timeout=15)
        response.raise_for_status()
        raw = response.json()
        fixtures = raw.get("data", raw) if isinstance(raw, dict) else raw
        matched = [
            (_score(home, item.get("participant1Name", "")), _score(away, item.get("participant2Name", "")), item)
            for item in fixtures
        ]
        matched = [item for item in matched if item[0] >= 0.72 and item[1] >= 0.72]
        if not matched:
            return [], "Fixture Betano no encontrado"
        fixture = max(matched, key=lambda item: item[0] + item[1])[2]

        response = requests.get(
            f"{BASE}/odds",
            params={"apiKey": key, "fixtureId": fixture["fixtureId"], "bookmakers": "betano", "language": "en", "verbosity": 3},
            timeout=15,
        )
        response.raise_for_status()
        book = response.json().get("bookmakerOdds", {}).get("betano", {})
        if not book or book.get("suspended"):
            return [], "Betano no tiene cuotas activas"

        response = requests.get(f"{BASE}/markets", params={"apiKey": key, "sportId": 10}, timeout=15)
        response.raise_for_status()
        raw_catalog = response.json()
        catalog_rows = raw_catalog.get("data", raw_catalog) if isinstance(raw_catalog, dict) else raw_catalog
        catalog = {str(item.get("marketId")): item for item in catalog_rows}
        result: list[dict] = []
        for market_id, market in book.get("markets", {}).items():
            spec = catalog.get(str(market_id), {})
            outcomes = {str(item.get("outcomeId")): str(item.get("outcomeName", "")) for item in spec.get("outcomes", [])}
            for outcome_id, outcome in market.get("outcomes", {}).items():
                for selection in outcome.get("players", {}).values():
                    price = selection.get("price")
                    if selection.get("active", True) and isinstance(price, (int, float)) and price > 1:
                        result.append(
                            {
                                "market": str(spec.get("marketName", market_id)),
                                "type": str(spec.get("marketType", "")),
                                "line": spec.get("handicap"),
                                "selection": outcomes.get(str(outcome_id), str(selection.get("bookmakerOutcomeId", ""))),
                                "odds": float(price),
                            }
                        )
        return result, None
    except (requests.RequestException, ValueError, KeyError) as exc:
        return [], f"OddsPapi: {exc}"
