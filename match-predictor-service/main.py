"""API de producción del predictor global de Futi Insight."""
from __future__ import annotations

from functools import lru_cache

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


@lru_cache(maxsize=1)
def global_predictor():
    """Crea modelos bajo demanda; el healthcheck no espera entrenamiento."""
    from global_match_predictor import GlobalPredictor

    return GlobalPredictor()


app = FastAPI(title="Futi Insight Global Match Predictor", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Sustituir por el dominio público del frontend en producción.
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class GlobalPredictionRequest(BaseModel):
    home_team: str = Field(min_length=2)
    away_team: str = Field(min_length=2)
    league: str = Field(min_length=2)
    mode: str = "quick"  # quick: un pick; detailed: grupos completos.
    manual_markets: list[dict] | None = None


@app.get("/health")
def health():
    return {"status": "ok", "service": "global-match-predictor", "version": "2.0.0"}


@app.get("/leagues")
def leagues():
    from global_match_predictor import LEAGUES

    return [
        {"code": code, "name": config["name"], "markets": config["markets"]}
        for code, config in LEAGUES.items()
    ]


@app.post("/global-predict")
def global_predict(body: GlobalPredictionRequest):
    """Predice el partido que se seleccionó desde el calendario del frontend."""
    from betano_client import markets as betano_markets
    from global_match_predictor import rank_betano_markets

    try:
        prediction = global_predictor().predict(body.league, body.home_team, body.away_team)
    except (LookupError, ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    if body.manual_markets:
        market_list, error = body.manual_markets, "Cuotas manuales del administrador"
    else:
        market_list, error = betano_markets(body.home_team, body.away_team, body.league)
    tiers = rank_betano_markets(prediction, market_list)
    if body.mode == "quick":
        best = next(
            (pick for group in ("high_value", "value", "low_value") for pick in tiers[group]),
            None,
        )
        return {"prediction": prediction, "best_pick": best, "betano_error": error}
    return {"prediction": prediction, "picks": tiers, "betano_error": error}
