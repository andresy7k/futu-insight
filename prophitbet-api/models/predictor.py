"""Load trained models and produce ensemble predictions."""
from __future__ import annotations

from typing import Optional

import joblib
import numpy as np

from data.downloader import download_league_data
from data.processor import build_features, known_teams, normalize_team_name
from models.trainer import _paths

LABEL_MAP = {0: "H", 1: "D", 2: "A"}

loaded_models: dict = {}


def load_models(league_code: str) -> bool:
    rf_p, xgb_p, sc_p = _paths(league_code)
    try:
        rf = joblib.load(rf_p)
        xgb = joblib.load(xgb_p)
        scaler = joblib.load(sc_p)
    except Exception as e:
        print(f"[predictor] load failed for {league_code}: {e}")
        return False
    loaded_models[league_code] = {"rf": rf, "xgb": xgb, "scaler": scaler}
    return True


def predict(home_team: str, away_team: str, league_code: str) -> Optional[dict]:
    if league_code not in loaded_models:
        if not load_models(league_code):
            return None

    df = download_league_data(league_code)
    if df is None or df.empty:
        return None

    teams = known_teams(df)
    h = normalize_team_name(home_team, teams)
    a = normalize_team_name(away_team, teams)
    if not h or not a:
        return {"supported": False, "reason": "team_not_found"}

    feats = build_features(df, h, a)
    if feats is None:
        return {"supported": False, "reason": "insufficient_history"}

    bundle = loaded_models[league_code]
    X = np.array([feats], dtype=float)
    Xs = bundle["scaler"].transform(X)
    p_rf = bundle["rf"].predict_proba(Xs)[0]
    p_xgb = bundle["xgb"].predict_proba(Xs)[0]
    ensemble = (p_rf + p_xgb) / 2.0

    idx = int(np.argmax(ensemble))
    prediction = LABEL_MAP[idx]
    confidence = float(np.max(ensemble) * 100.0)
    if confidence > 70:
        risk = "low"
    elif confidence >= 50:
        risk = "medium"
    else:
        risk = "high"

    return {
        "supported": True,
        "prediction": prediction,
        "probabilities": {
            "home": float(ensemble[0]),
            "draw": float(ensemble[1]),
            "away": float(ensemble[2]),
        },
        "confidence": confidence,
        "risk_level": risk,
        "matched_teams": {"home": h, "away": a},
    }