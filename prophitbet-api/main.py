"""ProphitBet FastAPI microservice — soccer match ML predictions."""
from __future__ import annotations

import threading
from datetime import datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from models.predictor import load_models, loaded_models, predict
from models.trainer import models_need_retraining, train_models

app = FastAPI(title="ProphitBet API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPPORTED_LEAGUES = {
    "E0": "English Premier League",
    "SP1": "La Liga",
    "I1": "Serie A",
    "D1": "Bundesliga",
    "F1": "Ligue 1",
}


class PredictRequest(BaseModel):
    home_team: str
    away_team: str
    league: str


@app.on_event("startup")
async def startup():
    def init():
        for league_code in SUPPORTED_LEAGUES:
            try:
                if models_need_retraining(league_code):
                    print(f"[startup] Training {league_code}...")
                    train_models(league_code)
                if load_models(league_code):
                    print(f"[startup] {league_code} ready")
                else:
                    print(f"[startup] {league_code} models not loaded")
            except Exception as e:
                print(f"[startup] Failed to init {league_code}: {e}")
    threading.Thread(target=init, daemon=True).start()


@app.get("/health")
def health():
    return {"status": "ok", "models_loaded": list(loaded_models.keys())}


@app.get("/leagues")
def leagues():
    return SUPPORTED_LEAGUES


@app.post("/predict")
def predict_match(body: PredictRequest):
    try:
        if body.league not in SUPPORTED_LEAGUES:
            return {"supported": False, "fallback": True, "reason": "league_not_supported"}

        result = predict(body.home_team, body.away_team, body.league)

        if result is None:
            return {"supported": False, "fallback": True, "reason": "model_unavailable"}

        if not result.get("supported", True):
            return {**result, "fallback": True}

        return {
            "home_team": body.home_team,
            "away_team": body.away_team,
            "league": body.league,
            "supported": True,
            "fallback": False,
            "prediction": result["prediction"],
            "probabilities": result["probabilities"],
            "confidence": result["confidence"],
            "risk_level": result["risk_level"],
            "model_used": "ensemble",
            "generated_at": datetime.utcnow().isoformat() + "Z",
        }
    except Exception as e:
        print(f"[predict] error: {e}")
        return {"supported": False, "fallback": True, "reason": "internal_error"}


@app.get("/retrain/{league_code}")
def retrain(league_code: str):
    if league_code not in SUPPORTED_LEAGUES:
        return {"error": "league_not_supported"}

    def do_retrain():
        try:
            train_models(league_code)
            load_models(league_code)
        except Exception as e:
            print(f"[retrain] {league_code} failed: {e}")

    threading.Thread(target=do_retrain, daemon=True).start()
    return {"status": "retraining_started", "league": league_code}