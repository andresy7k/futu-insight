"""API de producción para el predictor de partidos.

Railway inicia este módulo una vez; el modelo se entrena al importar el predictor
y luego queda en memoria para todas las solicitudes.
"""
from __future__ import annotations

from functools import lru_cache
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

@lru_cache(maxsize=1)
def predictor_module():
    """Carga/entrena una vez, bajo demanda; el healthcheck no queda bloqueado."""
    import match_predictor_full
    return match_predictor_full

app = FastAPI(title="Futi Insight Match Predictor", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restringir a tu dominio de Vercel en producción.
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class PredictionRequest(BaseModel):
    home_team: str = Field(min_length=2)
    away_team: str = Field(min_length=2)
    league: str | None = None
    bankroll: float = Field(default=100, gt=0)
    include_betano: bool = True


@app.get("/health")
def health():
    return {"status": "ok", "service": "match-predictor"}


@app.get("/teams")
def teams():
    return predictor_module().get_teams_list()


@app.get("/leagues")
def leagues():
    return predictor_module().get_leagues_list()


@app.post("/predict")
def predict(body: PredictionRequest):
    predictor = predictor_module()
    odds, all_markets = None, []
    if body.include_betano:
        try:
            odds, all_markets = predictor.get_betano_odds(body.home_team, body.away_team, include_all=True)
        except Exception as exc:
            # Una predicción de modelo sigue siendo útil si Betano no lista aún el fixture.
            betano_error = str(exc)
        else:
            betano_error = None
    else:
        betano_error = None
    result = predictor.predict_with_odds_analysis(body.home_team, body.away_team, body.league, odds)
    if result is None:
        raise HTTPException(status_code=404, detail="Equipo no encontrado en el dataset del modelo")
    if all_markets:
        result["odds_analysis"].extend(predictor.analyze_specialty_markets(all_markets, result["predictions"]))
    result["betano"] = {
        "available": bool(all_markets),
        "markets": all_markets,
        "error": betano_error,
    }
    result["bankroll"] = body.bankroll
    return result
