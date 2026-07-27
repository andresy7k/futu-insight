"""Train ensemble (RandomForest + XGBoost) models per league."""
from __future__ import annotations

import os
import time
from typing import Optional

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

from data.downloader import download_league_data
from data.processor import get_training_data

TRAINED_DIR = os.path.join(os.path.dirname(__file__), "..", "storage", "trained")
MODEL_TTL_SECONDS = 7 * 24 * 60 * 60


def _paths(league_code: str):
    os.makedirs(TRAINED_DIR, exist_ok=True)
    return (
        os.path.join(TRAINED_DIR, f"{league_code}_rf.pkl"),
        os.path.join(TRAINED_DIR, f"{league_code}_xgb.pkl"),
        os.path.join(TRAINED_DIR, f"{league_code}_scaler.pkl"),
    )


def models_need_retraining(league_code: str) -> bool:
    rf, xgb, sc = _paths(league_code)
    for p in (rf, xgb, sc):
        if not os.path.exists(p):
            return True
        if time.time() - os.path.getmtime(p) > MODEL_TTL_SECONDS:
            return True
    return False


def train_models(league_code: str) -> bool:
    df = download_league_data(league_code)
    if df is None or df.empty:
        print(f"[trainer] no data for {league_code}")
        return False

    X, y = get_training_data(df)
    if len(X) < 50:
        print(f"[trainer] insufficient data for {league_code}: {len(X)} rows")
        return False

    # Chronological split (no shuffle)
    split = int(len(X) * 0.8)
    X_train, X_eval = X[:split], X[split:]
    y_train, y_eval = y[:split], y[split:]

    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_eval_s = scaler.transform(X_eval)

    rf = RandomForestClassifier(n_estimators=200, random_state=42, class_weight="balanced")
    rf.fit(X_train_s, y_train)

    xgb = XGBClassifier(
        n_estimators=200, random_state=42, eval_metric="mlogloss", use_label_encoder=False,
    )
    xgb.fit(X_train_s, y_train)

    rf_acc = accuracy_score(y_eval, rf.predict(X_eval_s)) if len(X_eval) else float("nan")
    xgb_acc = accuracy_score(y_eval, xgb.predict(X_eval_s)) if len(X_eval) else float("nan")
    print(f"[trainer] {league_code} RF acc={rf_acc:.3f} XGB acc={xgb_acc:.3f} (n_train={len(X_train)}, n_eval={len(X_eval)})")

    rf_p, xgb_p, sc_p = _paths(league_code)
    joblib.dump(rf, rf_p)
    joblib.dump(xgb, xgb_p)
    joblib.dump(scaler, sc_p)
    return True