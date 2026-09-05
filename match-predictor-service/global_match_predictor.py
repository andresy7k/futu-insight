"""Predictor global multi-liga con límites de mercado por calidad de datos.

No mezcla métricas ausentes de Brasil/Argentina con las ligas europeas. Cada
liga mantiene su propio estado Elo, tasas ponderadas y modelos calibrados.
"""
from __future__ import annotations

import glob
import json
import re
from difflib import SequenceMatcher
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from scipy.stats import poisson
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestRegressor
from sklearn.linear_model import PoissonRegressor
from sklearn.model_selection import TimeSeriesSplit
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).parent / "data"
LEAGUES = {
    "ES": {"name": "España", "patterns": ("matches_*_ES.csv",), "markets": ("1x2", "double_chance", "goals", "btts", "corners", "cards", "asian_handicap")},
    "E0": {"name": "Inglaterra", "patterns": ("matches_*_ING.csv",), "markets": ("1x2", "double_chance", "goals", "btts", "corners", "cards", "asian_handicap")},
    "I1": {"name": "Italia", "patterns": ("matches_*_IT.csv",), "markets": ("1x2", "double_chance", "goals", "btts", "corners", "cards", "asian_handicap")},
    "F1": {"name": "Francia", "patterns": ("matches_*_FR.csv",), "markets": ("1x2", "double_chance", "goals", "btts", "corners", "cards", "asian_handicap")},
    "D1": {"name": "Alemania", "patterns": ("matches_*_AL.csv",), "markets": ("1x2", "double_chance", "goals", "btts", "corners", "cards", "asian_handicap")},
    # Sin tiros/córners/tarjetas: esas recomendaciones quedan explícitamente bloqueadas.
    "BR": {"name": "Brasil", "patterns": ("matches_BR.csv",), "markets": ("1x2", "double_chance", "goals", "btts", "asian_handicap")},
    "ARG": {"name": "Argentina", "patterns": ("matches_ARG.csv",), "markets": ("1x2", "double_chance", "goals", "btts", "asian_handicap")},
}
ALIASES = {"SP1": "ES", "SP2": "ES", "ING": "E0", "IT": "I1", "FR": "F1", "AL": "D1", "BRA": "BR", "ARGENTINA": "ARG"}
FEATURES = ("elo_home", "elo_away", "elo_diff", "home_gf", "home_ga", "away_gf", "away_ga", "form_diff", "rest_diff", "league_gpg")


def canonical_league(league: str) -> str:
    key = str(league).upper().strip()
    return ALIASES.get(key, key)

def _team_key(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(name).lower().translate(str.maketrans("áéíóúüñ", "aeiouun")))

def resolve_team(name: str, known: set[str]) -> str:
    if name in known: return name
    target = _team_key(name)
    scored = [(1.0 if target in _team_key(team) or _team_key(team) in target else SequenceMatcher(None,target,_team_key(team)).ratio(), team) for team in known]
    score, team = max(scored, default=(0., ""))
    if score < .72: raise LookupError(f"Equipo no disponible: {name}")
    return team


def _numeric(frame: pd.DataFrame, name: str) -> pd.Series:
    return pd.to_numeric(frame[name], errors="coerce").fillna(0) if name in frame else pd.Series(0., index=frame.index)


def load_league(code: str) -> pd.DataFrame:
    code = canonical_league(code)
    if code not in LEAGUES:
        raise ValueError(f"Liga no soportada: {code}")
    files = [file for pattern in LEAGUES[code]["patterns"] for file in glob.glob(str(ROOT / code / pattern))]
    if not files:
        raise FileNotFoundError(f"No hay CSV para {code} en {ROOT / code}")
    raw = pd.concat([pd.read_csv(file, low_memory=False) for file in sorted(files)], ignore_index=True)
    raw.columns = raw.columns.str.strip()
    rename = {"Home": "HomeTeam", "Away": "AwayTeam", "HG": "HomeGoals", "AG": "AwayGoals", "FTHG": "HomeGoals", "FTAG": "AwayGoals", "HS": "HomeShots", "AS": "AwayShots", "HST": "HomeSOT", "AST": "AwaySOT", "HC": "HomeCorners", "AC": "AwayCorners", "HY": "HomeYellows", "AY": "AwayYellows", "HR": "HomeReds", "AR": "AwayReds"}
    df = raw.rename(columns=rename).copy()
    for col in ("HomeGoals", "AwayGoals", "HomeShots", "AwayShots", "HomeSOT", "AwaySOT", "HomeCorners", "AwayCorners", "HomeYellows", "AwayYellows", "HomeReds", "AwayReds"):
        df[col] = _numeric(df, col)
    df["Date"] = pd.to_datetime(df.get("Date"), dayfirst=True, errors="coerce")
    df = df.dropna(subset=["Date", "HomeTeam", "AwayTeam"]).sort_values(["Date", "Time"] if "Time" in df else "Date").reset_index(drop=True)
    df["HomeTeam"] = df.HomeTeam.astype(str).str.strip(); df["AwayTeam"] = df.AwayTeam.astype(str).str.strip()
    df["HomeCards"] = df.HomeYellows + 2 * df.HomeReds; df["AwayCards"] = df.AwayYellows + 2 * df.AwayReds
    return df


@dataclass
class State:
    elo: float = 1500.0
    last_date: pd.Timestamp | None = None
    n: int = 0
    rates: dict[str, float] = field(default_factory=lambda: defaultdict(float))
    def value(self, key: str, prior: float) -> float: return self.rates[key] if self.n else prior
    def update(self, values: dict[str, float], date: pd.Timestamp, decay: float = .82):
        for key, val in values.items(): self.rates[key] = val if not self.n else decay * self.rates[key] + (1 - decay) * val
        self.last_date, self.n = date, self.n + 1


class SequentialEngine:
    def __init__(self): self.teams: dict[str, State] = defaultdict(State); self.goals: list[float] = []
    def features(self, home: str, away: str, date: pd.Timestamp) -> dict[str, float]:
        h, a = self.teams[home], self.teams[away]
        rest_h = 7 if h.last_date is None else min(21, max(0, (date-h.last_date).days)); rest_a = 7 if a.last_date is None else min(21, max(0, (date-a.last_date).days))
        return {"elo_home": h.elo, "elo_away": a.elo, "elo_diff": h.elo-a.elo, "home_gf": h.value("gf", 1.25), "home_ga": h.value("ga", 1.25), "away_gf": a.value("gf", 1.25), "away_ga": a.value("ga", 1.25), "form_diff": h.value("pts", 1.25)-a.value("pts", 1.25), "rest_diff": rest_h-rest_a, "league_gpg": float(np.mean(self.goals[-300:])) if self.goals else 1.25}
    def update(self, r: pd.Series):
        hg, ag = float(r.HomeGoals), float(r.AwayGoals); h, a = self.teams[r.HomeTeam], self.teams[r.AwayTeam]
        actual = 1 if hg > ag else .5 if hg == ag else 0; expected = 1/(1+10**((a.elo-(h.elo+55))/400)); delta = 20*min(2, 1+.25*abs(hg-ag))*(actual-expected)
        h.elo += delta; a.elo -= delta
        h.update({"gf":hg,"ga":ag,"pts":3 if hg>ag else 1 if hg==ag else 0},r.Date); a.update({"gf":ag,"ga":hg,"pts":3 if ag>hg else 1 if hg==ag else 0},r.Date); self.goals.extend((hg,ag))


class LeagueModel:
    def __init__(self, code: str): self.code=canonical_league(code); self.engine=SequentialEngine(); self.stats_models={}
    def fit(self):
        df=load_league(self.code); rows=[]
        for _,r in df.iterrows():
            row=self.engine.features(r.HomeTeam,r.AwayTeam,r.Date); row.update({"result":2 if r.HomeGoals>r.AwayGoals else 1 if r.HomeGoals==r.AwayGoals else 0,"hg":r.HomeGoals,"ag":r.AwayGoals,"corners":r.HomeCorners+r.AwayCorners,"cards":r.HomeCards+r.AwayCards});rows.append(row);self.engine.update(r)
        train=pd.DataFrame(rows); X=train[list(FEATURES)].fillna(0); y=train.result
        cv=TimeSeriesSplit(n_splits=min(5,max(3,len(train)//400)))
        base=HistGradientBoostingClassifier(learning_rate=.045,max_leaf_nodes=12,min_samples_leaf=25,l2_regularization=2,max_iter=250,random_state=42)
        self.outcomes=CalibratedClassifierCV(base,method="sigmoid",cv=cv).fit(X,y)
        self.goals_home=make_pipeline(StandardScaler(),PoissonRegressor(alpha=.5,max_iter=700)).fit(X,train.hg.clip(0,8)); self.goals_away=make_pipeline(StandardScaler(),PoissonRegressor(alpha=.5,max_iter=700)).fit(X,train.ag.clip(0,8))
        for stat in ("corners","cards"):
            if stat in LEAGUES[self.code]["markets"] and train[stat].std()>0:
                self.stats_models[stat]=make_pipeline(StandardScaler(),PoissonRegressor(alpha=.8,max_iter=700)).fit(X,train[stat].clip(0,25))
        self.teams=set(pd.concat([df.HomeTeam,df.AwayTeam])); return self
    def predict(self, home: str, away: str) -> dict[str, Any]:
        home, away = resolve_team(home,self.teams), resolve_team(away,self.teams)
        X=pd.DataFrame([self.engine.features(home,away,pd.Timestamp.now())])[list(FEATURES)]; p=self.outcomes.predict_proba(X)[0]; c=list(self.outcomes.classes_); lh=float(np.clip(self.goals_home.predict(X)[0],.15,4.5));la=float(np.clip(self.goals_away.predict(X)[0],.15,4.5));M=np.outer(poisson.pmf(range(11),lh),poisson.pmf(range(11),la)); probs={"home_win":float(p[c.index(2)]),"draw":float(p[c.index(1)]),"away_win":float(p[c.index(0)]),"over_2.5":float(poisson.sf(2,lh+la)),"under_2.5":float(poisson.cdf(2,lh+la)),"btts_yes":float((1-np.exp(-lh))*(1-np.exp(-la)))};probs["btts_no"]=1-probs["btts_yes"];probs["1X"]=probs["home_win"]+probs["draw"];probs["X2"]=probs["away_win"]+probs["draw"]
        totals={"goals":lh+la};
        for name,model in self.stats_models.items(): totals[name]=float(np.clip(model.predict(X)[0],.1,25))
        return {"league":self.code,"supported_markets":LEAGUES[self.code]["markets"],"expected":totals,"probabilities":probs,"score_expectation":{"home":lh,"away":la}}


class GlobalPredictor:
    def __init__(self): self.models: dict[str,LeagueModel]={}
    def fit(self, leagues: tuple[str,...]|None=None):
        for code in leagues or tuple(LEAGUES): self.models[canonical_league(code)]=LeagueModel(code).fit()
        return self
    def predict(self, league: str, home: str, away: str):
        code=canonical_league(league)
        if code not in self.models: self.models[code]=LeagueModel(code).fit()
        return self.models[code].predict(home,away)

def rank_betano_markets(prediction: dict[str, Any], markets: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Clasifica por EV solo mercados con probabilidad soportada por la liga."""
    probs, expected, allowed = prediction["probabilities"], prediction["expected"], set(prediction["supported_markets"])
    tiers={"high_value":[],"value":[],"low_value":[],"not_recommended":[]}
    for item in markets:
        name,kind,selection=str(item["market"]).lower(),str(item["type"]).lower(),str(item["selection"]).lower(); odds=float(item["odds"]); line=float(pd.to_numeric(item.get("line"),errors="coerce")) if not pd.isna(pd.to_numeric(item.get("line"),errors="coerce")) else np.nan
        key=None; probability=None; reason=None
        if kind=="1x2": key={"1":"home_win","x":"draw","2":"away_win","home":"home_win","away":"away_win","draw":"draw"}.get(selection); probability=probs.get(key) if key else None
        elif ("both teams" in name or "btts" in name) and "btts" in allowed: key="btts_yes" if selection=="yes" else "btts_no" if selection=="no" else None; probability=probs.get(key) if key else None
        elif "handicap" in name or "handicap" in kind:
            # OddsPapi expresa la línea desde la perspectiva del local; 2/Away la invierte.
            if "asian_handicap" in allowed and np.isfinite(line):
                home_side = selection in {"1", "home", "local"}
                # The Odds API entrega el spread desde el lado seleccionado;
                # OddsPapi conserva la línea desde la perspectiva del local.
                handicap = line if (home_side or not item.get("line_for_selection")) else -line
                outcomes = _asian_handicap_outcomes(prediction["score_expectation"]["home"], prediction["score_expectation"]["away"], handicap)
                probability, push_probability = outcomes[0], outcomes[1]
                key = f"{'home' if home_side else 'away'} AH {line:g}"
                reason = f"Push estimado: {push_probability:.1%}"
        elif ("goal" in name or "total" in kind) and np.isfinite(line):
            metric="goals" if "corner" not in name and "card" not in name else "corners" if "corner" in name else "cards"
            if metric in allowed:
                probability = float(poisson.sf(int(np.floor(line)), expected[metric]) if selection == "over" else poisson.cdf(int(np.ceil(line) - 1), expected[metric]))
                key = f"{selection} {line:g} {metric}"
        elif "corner" in name or "card" in name: reason="Mercado bloqueado: cobertura insuficiente en esta liga"
        elif "player" in name or "scorer" in name: reason="Props bloqueadas: no hay datos de jugadores/alineaciones"
        if probability is None:
            tiers["not_recommended"].append({**item,"reason":reason or "Mercado no modelado"}); continue
        # Para hándicaps asiáticos, el push devuelve la apuesta y no debe contarse como pérdida.
        if key and " AH " in key:
            loss_probability = 1 - probability - push_probability
            ev = probability * (odds - 1) - loss_probability
        else:
            ev=probability*odds-1
        record={**item,"probability":round(probability,4),"ev_pct":round(ev*100,2),"fair_odds":round(1/probability,3) if probability else None, **({"reason": reason} if reason else {})}
        tiers["high_value" if ev>=.10 else "value" if ev>=.05 else "low_value" if ev>=.03 else "not_recommended"].append(record)
    for picks in tiers.values(): picks.sort(key=lambda x:x.get("ev_pct",-999),reverse=True)
    return tiers


def _asian_handicap_outcomes(home_xg: float, away_xg: float, handicap: float) -> tuple[float, float, float]:
    """Probabilidades win/push/loss, incluso para líneas asiáticas de cuarto."""
    matrix = np.outer(poisson.pmf(range(12), home_xg), poisson.pmf(range(12), away_xg))

    def settled(line: float) -> tuple[float, float, float]:
        diff = np.subtract.outer(np.arange(12), np.arange(12)) + line
        return float(matrix[diff > 0].sum()), float(matrix[np.isclose(diff, 0)].sum()), float(matrix[diff < 0].sum())

    # -0.25 se divide entre 0 y -0.5; +0.75 entre +0.5 y +1.0.
    fractional = abs(handicap * 4) % 2
    if np.isclose(fractional, 1):
        lower = np.floor(handicap * 2) / 2
        upper = np.ceil(handicap * 2) / 2
        a, b = settled(lower), settled(upper)
        return tuple((x + y) / 2 for x, y in zip(a, b))
    return settled(handicap)


def terminal():
    model=GlobalPredictor(); print("Predictor global: ES, E0, I1, F1, D1, BR, ARG")
    while True:
        league=input("Liga (o salir): ").strip()
        if league.lower() in ("salir","exit","q"): break
        home=input("Local: ").strip(); away=input("Visitante: ").strip()
        try: print(json.dumps(model.predict(league,home,away),ensure_ascii=False,indent=2))
        except Exception as exc: print(f"Error: {exc}")

if __name__=="__main__": terminal()
