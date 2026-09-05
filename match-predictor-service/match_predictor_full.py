import pandas as pd  # pyright: ignore[reportMissingModuleSource]
import numpy as np
import glob
import json
import os
import re
from difflib import SequenceMatcher
from datetime import timedelta, timezone
import requests
from scipy.stats import poisson, norm
from sklearn.model_selection import TimeSeriesSplit, cross_val_score
from sklearn.preprocessing import LabelEncoder
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import accuracy_score, brier_score_loss, log_loss
from datetime import datetime
import warnings
warnings.filterwarnings("ignore")
MODEL_N_JOBS = max(1, min(2, os.cpu_count() or 1))

def load_project_env(filename='.env'):
    """Carga claves de un .env local sin sobrescribir variables ya definidas.

    El archivo .env se mantiene fuera del código fuente y no debe subirse a Git.
    Soporta líneas con formato NOMBRE=valor y comentarios con #.
    """
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), filename)
    if not os.path.isfile(env_path):
        return False
    with open(env_path, encoding='utf-8') as env_file:
        for line in env_file:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            name, value = line.split('=', 1)
            name, value = name.strip(), value.strip().strip('"').strip("'")
            if name and name not in os.environ:
                os.environ[name] = value
    return True

load_project_env()

# === Intentar usar XGBoost ===
try:
    from xgboost import XGBClassifier, XGBRegressor
    CLASSIFIER = XGBClassifier
    REGRESSOR = XGBRegressor
    USE_XGB = True
except ImportError:
    CLASSIFIER = RandomForestClassifier
    REGRESSOR = RandomForestRegressor
    USE_XGB = False

# ============================================================================
# PARTE 1: CARGA Y ENTRENAMIENTO (igual que v2.0)
# ============================================================================

files = glob.glob("matches_*.csv")
if not files:
    raise FileNotFoundError("❌ No se encontraron archivos matches_*.csv")
dfs = [pd.read_csv(f) for f in files]
df = pd.concat(dfs, ignore_index=True)

df.columns = df.columns.str.strip()
df.rename(columns={
    'Home': 'HomeTeam', 'Away': 'AwayTeam',
    'HG': 'HomeGoals', 'AG': 'AwayGoals',
    'FTHG': 'HomeGoals', 'FTAG': 'AwayGoals',
    'HS': 'HomeShots', 'AS': 'AwayShots',
    'HST': 'HomeShotsOnTarget', 'AST': 'AwayShotsOnTarget',
    'HF': 'HomeFouls', 'AF': 'AwayFouls',
    'HC': 'HomeCorners', 'AC': 'AwayCorners',
    'HY': 'HomeYellows', 'AY': 'AwayYellows',
    'HR': 'HomeReds', 'AR': 'AwayReds',
    'Div': 'League'
}, inplace=True)

df.dropna(subset=['HomeTeam', 'AwayTeam', 'HomeGoals', 'AwayGoals'], inplace=True)
df['Date'] = pd.to_datetime(df.get('Date'), dayfirst=True, errors='coerce')
# El orden cronológico es obligatorio: evita que un partido futuro alimente sus features.
df.sort_values(['Date', 'Time'] if 'Time' in df.columns else ['Date'], inplace=True, na_position='last')
df.reset_index(drop=True, inplace=True)

for col in ['HomeYellows', 'AwayYellows', 'HomeReds', 'AwayReds', 'HomeCorners', 
            'AwayCorners', 'HomeShots', 'AwayShots', 'HomeShotsOnTarget', 
            'AwayShotsOnTarget', 'HomeFouls', 'AwayFouls']:
    if col not in df.columns:
        df[col] = 0

for col in df.columns:
    if col not in ['HomeTeam', 'AwayTeam', 'League', 'Date']:
        df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

df['HomeCards'] = df['HomeYellows'] + 2 * df['HomeReds']
df['AwayCards'] = df['AwayYellows'] + 2 * df['AwayReds']
df['TotalGoals'] = df['HomeGoals'] + df['AwayGoals']
df['TotalCorners'] = df['HomeCorners'] + df['AwayCorners']
df['TotalCards'] = df['HomeCards'] + df['AwayCards']
df['TotalShots'] = df['HomeShots'] + df['AwayShots']
df['TotalShotsOnTarget'] = df['HomeShotsOnTarget'] + df['AwayShotsOnTarget']
df['TotalFouls'] = df['HomeFouls'] + df['AwayFouls']

def result_code(row):
    if row['HomeGoals'] > row['AwayGoals']:
        return 1
    elif row['HomeGoals'] == row['AwayGoals']:
        return 0
    else:
        return -1

df['Result'] = df.apply(result_code, axis=1)
df['BTTS'] = ((df['HomeGoals'] > 0) & (df['AwayGoals'] > 0)).astype(int)

# Forma reciente
def calculate_recent_form(df, n_matches=5):
    form_data = {}
    if 'Date' in df.columns:
        df_sorted = df.sort_values('Date').copy()
    else:
        df_sorted = df.copy()
    
    for team in pd.concat([df['HomeTeam'], df['AwayTeam']]).unique():
        home_matches = df_sorted[df_sorted['HomeTeam'] == team].tail(n_matches)
        away_matches = df_sorted[df_sorted['AwayTeam'] == team].tail(n_matches)
        
        weights = np.linspace(0.1, 0.3, n_matches)
        
        home_gs = home_matches['HomeGoals'].values
        home_gc = home_matches['AwayGoals'].values
        
        if len(home_gs) > 0:
            w_home = weights[-len(home_gs):]
            form_data[f'{team}_goals_scored_L5'] = np.average(home_gs, weights=w_home)
            form_data[f'{team}_goals_conceded_L5'] = np.average(home_gc, weights=w_home)
        else:
            form_data[f'{team}_goals_scored_L5'] = 0
            form_data[f'{team}_goals_conceded_L5'] = 0
        
        all_matches = pd.concat([home_matches, away_matches]).tail(n_matches)
        points = []
        for _, match in all_matches.iterrows():
            if match['HomeTeam'] == team:
                if match['Result'] == 1:
                    points.append(3)
                elif match['Result'] == 0:
                    points.append(1)
                else:
                    points.append(0)
            else:
                if match['Result'] == -1:
                    points.append(3)
                elif match['Result'] == 0:
                    points.append(1)
                else:
                    points.append(0)
        
        form_data[f'{team}_points_L5'] = np.mean(points) if points else 0
    
    return form_data

form_data = calculate_recent_form(df, n_matches=5)

# Sistema Elo
def compute_dynamic_elo(df, k=20):
    """Elo pre-partido. history guarda el rating ANTES de conocer el resultado."""
    elo_attack = {t: 1500 for t in pd.concat([df['HomeTeam'], df['AwayTeam']]).unique()}
    elo_defense = {t: 1500 for t in pd.concat([df['HomeTeam'], df['AwayTeam']]).unique()}
    history = []
    for _, r in df.iterrows():
        home, away = r['HomeTeam'], r['AwayTeam']
        home_goals, away_goals = r['HomeGoals'], r['AwayGoals']
        history.append({'HomeEloAttack': elo_attack[home], 'AwayEloAttack': elo_attack[away],
                        'HomeEloDefense': elo_defense[home], 'AwayEloDefense': elo_defense[away]})
        
        exp_home_attack = 1 / (1 + 10 ** ((elo_defense[away] - elo_attack[home]) / 400))
        exp_away_attack = 1 / (1 + 10 ** ((elo_defense[home] - elo_attack[away]) / 400))
        
        home_perf = min(home_goals / 3, 1)
        away_perf = min(away_goals / 3, 1)
        
        elo_attack[home] += k * (home_perf - exp_home_attack)
        elo_attack[away] += k * (away_perf - exp_away_attack)
        elo_defense[home] += k * ((1 - away_perf) - (1 - exp_away_attack))
        elo_defense[away] += k * ((1 - home_perf) - (1 - exp_home_attack))
    
    return elo_attack, elo_defense, pd.DataFrame(history, index=df.index)

elo_attack, elo_defense, elo_history = compute_dynamic_elo(df)
df[['HomeEloAttack', 'AwayEloAttack', 'HomeEloDefense', 'AwayEloDefense']] = elo_history

# Ventaja localía
home_advantage = {}
if 'League' in df.columns:
    for league in df['League'].unique():
        league_df = df[df['League'] == league]
        home_advantage[league] = league_df['HomeGoals'].mean() - league_df['AwayGoals'].mean()
    df['HomeAdvantage'] = df['League'].map(home_advantage).fillna(0.3)
else:
    df['HomeAdvantage'] = 0.3

# Estilos
team_styles = {}
for team in pd.concat([df['HomeTeam'], df['AwayTeam']]).unique():
    team_home = df[df['HomeTeam'] == team]
    team_away = df[df['AwayTeam'] == team]
    
    total_shots = team_home['HomeShots'].sum() + team_away['AwayShots'].sum()
    total_sot = team_home['HomeShotsOnTarget'].sum() + team_away['AwayShotsOnTarget'].sum()
    total_goals = team_home['HomeGoals'].sum() + team_away['AwayGoals'].sum()
    
    team_styles[team] = {
        'shot_accuracy': (total_sot / total_shots) if total_shots > 0 else 0.3,
        'finishing': (total_goals / total_sot) if total_sot > 0 else 0.1,
        'aggression': (team_home['HomeCards'].mean() + team_away['AwayCards'].mean()) / 2,
        'corner_rate': (team_home['HomeCorners'].mean() + team_away['AwayCorners'].mean()) / 2
    }

# Codificación
encoder = LabelEncoder()
teams = pd.concat([df['HomeTeam'], df['AwayTeam']]).unique()
encoder.fit(teams)
df['HomeCode'] = encoder.transform(df['HomeTeam'])
df['AwayCode'] = encoder.transform(df['AwayTeam'])

has_league = 'League' in df.columns and not df['League'].isna().all()
if has_league:
    enc_league = LabelEncoder()
    enc_league.fit(df['League'].astype(str).unique())
    df['LeagueCode'] = enc_league.transform(df['League'].astype(str))
else:
    enc_league = None
    df['LeagueCode'] = 0

df['EloAttackDiff'] = df['HomeEloAttack'] - df['AwayEloAttack']
df['EloDefenseDiff'] = df['HomeEloDefense'] - df['AwayEloDefense']
df['EloTotalDiff'] = (df['HomeEloAttack'] + df['HomeEloDefense']) - (df['AwayEloAttack'] + df['AwayEloDefense'])

# Entrenamiento
feature_cols = ['HomeCode', 'AwayCode', 'LeagueCode', 
                'HomeEloAttack', 'AwayEloAttack', 
                'HomeEloDefense', 'AwayEloDefense',
                'EloAttackDiff', 'EloDefenseDiff', 'EloTotalDiff',
                'HomeAdvantage']

X = df[feature_cols].fillna(0)
y_result = df['Result'].map({-1: 0, 0: 1, 1: 2})

# Holdout temporal: el 20% final simula el futuro. Nunca usar división aleatoria en deportes.
cutoff = max(1, int(len(X) * 0.8))
X_train, X_test = X.iloc[:cutoff], X.iloc[cutoff:]
y_train, y_test = y_result.iloc[:cutoff], y_result.iloc[cutoff:]

clf_result = (CLASSIFIER(n_estimators=300, max_depth=8, learning_rate=0.06, random_state=42,
                         n_jobs=MODEL_N_JOBS, tree_method='hist') if USE_XGB
              else CLASSIFIER(n_estimators=300, random_state=42, n_jobs=MODEL_N_JOBS))
clf_result.fit(X_train, y_train)

# Platt scaling con folds temporales: más estable que isotonic para muestras moderadas.
calibrated_model = CalibratedClassifierCV(clf_result, cv=TimeSeriesSplit(n_splits=3), method='sigmoid')
calibrated_model.fit(X_train, y_train)

test_probs = calibrated_model.predict_proba(X_test)
temporal_brier = np.mean([brier_score_loss((y_test == label).astype(int), test_probs[:, i])
                          for i, label in enumerate(calibrated_model.classes_)])
temporal_logloss = log_loss(y_test, test_probs, labels=calibrated_model.classes_)

clf_btts = (CLASSIFIER(n_estimators=250, max_depth=6, learning_rate=0.06, random_state=42,
                       n_jobs=MODEL_N_JOBS, tree_method='hist') if USE_XGB
            else CLASSIFIER(n_estimators=250, random_state=42, n_jobs=MODEL_N_JOBS))
clf_btts.fit(X, df['BTTS'])

# Regresores
reg_models = {}
stats_to_predict = ['HomeGoals', 'AwayGoals', 'HomeShots', 'AwayShots', 
                    'HomeShotsOnTarget', 'AwayShotsOnTarget', 'HomeFouls', 
                    'AwayFouls', 'HomeCorners', 'AwayCorners', 'HomeCards', 'AwayCards']

for stat in stats_to_predict:
    if stat in df.columns and df[stat].nunique() > 1:
        model = (REGRESSOR(n_estimators=160, max_depth=6, learning_rate=0.06, random_state=42,
                           n_jobs=MODEL_N_JOBS, tree_method='hist') if USE_XGB
                 else REGRESSOR(n_estimators=160, random_state=42, n_jobs=MODEL_N_JOBS))
        model.fit(X, df[stat])
        reg_models[stat] = model

avg_stats = {}
for stat in stats_to_predict:
    if 'Home' in stat:
        avg_stats[stat] = df.groupby('HomeTeam')[stat].mean().to_dict()
    else:
        avg_stats[stat] = df.groupby('AwayTeam')[stat].mean().to_dict()

print(f"✅ Sistema entrenado | XGBoost: {USE_XGB} | Equipos: {len(teams)} | Partidos: {len(df)}")

# ============================================================================
# PARTE 2: FUNCIONES DE ANÁLISIS DE CUOTAS
# ============================================================================

def odds_to_prob(odds):
    """Convierte cuota decimal a probabilidad"""
    return 1 / odds if odds > 0 else 0

def prob_to_odds(prob):
    """Convierte probabilidad a cuota decimal"""
    return 1 / prob if prob > 0 else 1.01

def calculate_ev(prob_model, odds_bookmaker, stake=1):
    """Calcula Expected Value (Valor Esperado)"""
    prob_bookie = odds_to_prob(odds_bookmaker)
    ev = (prob_model * (odds_bookmaker - 1) * stake) - ((1 - prob_model) * stake)
    ev_pct = (prob_model * odds_bookmaker - 1) * 100
    return ev, ev_pct

def calculate_kelly(prob_model, odds_bookmaker, fraction=0.25, max_stake=0.02):
    """Calcula Kelly Criterion para sizing"""
    q = 1 - prob_model
    kelly = ((odds_bookmaker * prob_model - 1) / (odds_bookmaker - 1))
    kelly_fractional = kelly * fraction  # Usar Kelly fraccionario (25% por seguridad)
    return max(0, min(kelly_fractional, max_stake))  # Máximo 2% por selección

def analyze_odds_value(prob_model, odds_bookmaker, market_name):
    """Análisis completo de valor de una cuota"""
    prob_bookie = odds_to_prob(odds_bookmaker)
    margin = prob_bookie - prob_model
    
    ev, ev_pct = calculate_ev(prob_model, odds_bookmaker)
    kelly_stake = calculate_kelly(prob_model, odds_bookmaker) * 100
    
    # Clasificación de valor
    if ev_pct > 15:
        value_rating = "🔥 VALOR EXCEPCIONAL"
        action = "APUESTA FUERTE"
    elif ev_pct > 10:
        value_rating = "💎 EXCELENTE VALOR"
        action = "APUESTA RECOMENDADA"
    elif ev_pct > 5:
        value_rating = "✅ BUEN VALOR"
        action = "APUESTA MODERADA"
    elif ev_pct > 2:
        value_rating = "🟡 VALOR LEVE"
        action = "APUESTA PEQUEÑA"
    elif ev_pct > -2:
        value_rating = "⚪ SIN VALOR"
        action = "SKIP"
    else:
        value_rating = "❌ MALA CUOTA"
        action = "NO APOSTAR"
    
    return {
        'market': market_name,
        'prob_model': prob_model,
        'prob_bookie': prob_bookie,
        'odds_bookie': odds_bookmaker,
        'odds_fair': prob_to_odds(prob_model),
        'margin': margin,
        'ev': ev,
        'ev_pct': ev_pct,
        'kelly_pct': kelly_stake,
        'value_rating': value_rating,
        'action': action
    }

# ============================================================================
# PARTE 3: FUNCIÓN PRINCIPAL CON ANÁLISIS DE CUOTAS
# ============================================================================

def predict_with_odds_analysis(home, away, league=None, bookmaker_odds=None):
    """
    Predicción con análisis opcional de cuotas
    
    bookmaker_odds: dict con cuotas de la casa (opcional)
    Ejemplo:
    {
        'home_win': 2.10,
        'draw': 3.40,
        'away_win': 3.60,
        'btts_yes': 1.85,
        'over_2.5': 2.00,
        'under_2.5': 1.80
    }
    """
    
    if home not in encoder.classes_ or away not in encoder.classes_:
        return None
    
    # Preparar features
    home_code = int(encoder.transform([home])[0])
    away_code = int(encoder.transform([away])[0])
    
    if has_league and enc_league and isinstance(league, str):
        try:
            league_code = int(enc_league.transform([league])[0])
            home_adv = home_advantage.get(league, 0.3)
        except:
            league_code = 0
            home_adv = 0.3
    else:
        league_code = 0
        home_adv = 0.3
    
    X_input = pd.DataFrame([{
        'HomeCode': home_code,
        'AwayCode': away_code,
        'LeagueCode': league_code,
        'HomeEloAttack': elo_attack[home],
        'AwayEloAttack': elo_attack[away],
        'HomeEloDefense': elo_defense[home],
        'AwayEloDefense': elo_defense[away],
        'EloAttackDiff': elo_attack[home] - elo_attack[away],
        'EloDefenseDiff': elo_defense[home] - elo_defense[away],
        'EloTotalDiff': (elo_attack[home] + elo_defense[home]) - (elo_attack[away] + elo_defense[away]),
        'HomeAdvantage': home_adv
    }])
    
    # Probabilidades
    probs = calibrated_model.predict_proba(X_input)[0]
    classes = calibrated_model.classes_
    
    prob_home = float(probs[classes == 2][0]) if 2 in classes else 0.0
    prob_draw = float(probs[classes == 1][0]) if 1 in classes else 0.0
    prob_away = float(probs[classes == 0][0]) if 0 in classes else 0.0
    prob_btts = float(clf_btts.predict_proba(X_input)[0][1])
    
    # Stats
    preds = {}
    for stat in stats_to_predict:
        if stat in reg_models:
            preds[stat] = float(reg_models[stat].predict(X_input)[0])
        else:
            team = home if 'Home' in stat else away
            preds[stat] = avg_stats.get(stat, {}).get(team, 0)
    
    total_goals = preds['HomeGoals'] + preds['AwayGoals']
    
    # Probabilidades de líneas comunes
    def poisson_line_prob(lambda_home, lambda_away, line, over=True):
        matrix = np.zeros((16, 16))
        for h in range(16):
            for a in range(16):
                matrix[h, a] = poisson.pmf(h, lambda_home) * poisson.pmf(a, lambda_away)
        total_goals_matrix = np.add.outer(np.arange(16), np.arange(16))
        if over:
            return matrix[total_goals_matrix > line].sum()
        else:
            return matrix[total_goals_matrix <= line].sum()
    
    prob_over_05 = poisson_line_prob(preds['HomeGoals'], preds['AwayGoals'], 0.5, True)
    prob_over_15 = poisson_line_prob(preds['HomeGoals'], preds['AwayGoals'], 1.5, True)
    prob_over_25 = poisson_line_prob(preds['HomeGoals'], preds['AwayGoals'], 2.5, True)
    prob_over_35 = poisson_line_prob(preds['HomeGoals'], preds['AwayGoals'], 3.5, True)
    
    model_probs = {
        'home_win': prob_home,
        'draw': prob_draw,
        'away_win': prob_away,
        'btts_yes': prob_btts,
        'btts_no': 1 - prob_btts,
        'over_0.5': prob_over_05,
        'under_0.5': 1 - prob_over_05,
        'over_1.5': prob_over_15,
        'under_1.5': 1 - prob_over_15,
        'over_2.5': prob_over_25,
        'under_2.5': 1 - prob_over_25,
        'over_3.5': prob_over_35,
        'under_3.5': 1 - prob_over_35,
        '1X': prob_home + prob_draw,
        'X2': prob_draw + prob_away,
        '12': prob_home + prob_away
    }
    
    # ANALIZAR CUOTAS SI SE PROPORCIONAN
    odds_analysis = []
    if bookmaker_odds:
        for market_key, odds in bookmaker_odds.items():
            if market_key in model_probs:
                analysis = analyze_odds_value(
                    model_probs[market_key],
                    odds,
                    market_key.replace('_', ' ').title()
                )
                odds_analysis.append(analysis)
    
    return {
        'home': home,
        'away': away,
        'model_probs': model_probs,
        'predictions': preds,
        'odds_analysis': odds_analysis,
        'elo': {
            'home_attack': elo_attack[home],
            'away_attack': elo_attack[away],
            'home_defense': elo_defense[home],
            'away_defense': elo_defense[away]
        }
    }

# ============================================================================
# PARTE 4: INTERFAZ INTERACTIVA MEJORADA
# ============================================================================

def show_available_teams():
    """Muestra equipos disponibles organizados"""
    teams_list = sorted(encoder.classes_)
    print(f"\n📋 EQUIPOS DISPONIBLES ({len(teams_list)} equipos)\n")
    for i, team in enumerate(teams_list, 1):
        print(f"{i:3d}. {team}", end="    ")
        if i % 3 == 0:
            print()
    print("\n")
    return teams_list

def select_team(prompt, teams_list):
    """Seleccionar equipo por número o nombre"""
    while True:
        choice = input(f"{prompt} (número o nombre): ").strip()
        
        if choice.isdigit():
            idx = int(choice) - 1
            if 0 <= idx < len(teams_list):
                return teams_list[idx]
            else:
                print(f"❌ Número inválido. Debe ser entre 1 y {len(teams_list)}")
        else:
            matches = [t for t in teams_list if choice.lower() in t.lower()]
            if len(matches) == 1:
                return matches[0]
            elif len(matches) > 1:
                print(f"⚠️  Múltiples coincidencias: {', '.join(matches)}")
                print("Sé más específico")
            else:
                print("❌ Equipo no encontrado")

def get_betano_odds(home, away, days=7, include_all=False):
    """Obtiene cuotas prepartido de Betano con OddsPapi sin guardar la clave en código.

    La clave se carga automáticamente desde el archivo .env del proyecto:
    ODDSPAPI_API_KEY=tu_clave
    Con include_all=True también devuelve todas las selecciones activas que Betano
    publica. El modelo solo valora mercados para los que calcula probabilidades.
    """
    key = os.getenv('ODDSPAPI_API_KEY')
    if not key:
        raise RuntimeError('Falta ODDSPAPI_API_KEY. Agrégala al archivo .env del proyecto.')
    base = 'https://api.oddspapi.io/v4'
    now = datetime.now(timezone.utc)
    response = requests.get(f'{base}/fixtures', params={
        'apiKey': key, 'sportId': 10,
        'from': now.strftime('%Y-%m-%dT%H:%M:%SZ'),
        'to': (now + timedelta(days=days)).strftime('%Y-%m-%dT%H:%M:%SZ')
    }, timeout=20)
    response.raise_for_status()
    fixtures_data = response.json()
    fixtures = fixtures_data.get('data', fixtures_data) if isinstance(fixtures_data, dict) else fixtures_data
    def normalize(value):
        return re.sub(r'[^a-z0-9]', '', str(value).lower().translate(str.maketrans('áéíóúüñ', 'aeiouun')))

    # Nombres históricos de Football-Data frente a los de OddsPapi/Betano.
    # Añade alias aquí cuando aparezca una nueva diferencia conocida.
    aliases = {
        'lacoruna': ['deportivolacoruna', 'rcdeportivodeacoruna', 'deportivoacoruna'],
        'vallecano': ['rayovallecano'], 'alaves': ['deportivoalaves'],
        'athbilbao': ['athleticbilbao'], 'espanyol': ['rcdespanyol'],
        'mallorca': ['rcdmallorca'], 'oviedo': ['realoviedo'],
        'villarreal': ['villarrealcf'], 'barcelona': ['fcbarcelona'],
        'realmadrid': ['realmadridcf'], 'atleticomadrid': ['clubatleticodemadrid'],
    }
    def team_score(local_name, provider_name):
        local, provider = normalize(local_name), normalize(provider_name)
        variants = [local] + [normalize(v) for v in aliases.get(local, [])]
        scores = []
        for variant in variants:
            if variant in provider or provider in variant:
                scores.append(1.0)
            else:
                scores.append(SequenceMatcher(None, variant, provider).ratio())
        return max(scores)

    # Mantiene la orientación local/visitante y evita aceptar coincidencias débiles.
    ranked = [(team_score(home, f.get('participant1Name', '')),
               team_score(away, f.get('participant2Name', '')), f) for f in fixtures]
    ranked = [item for item in ranked if item[0] >= 0.72 and item[1] >= 0.72]
    fixture = max(ranked, key=lambda item: item[0] + item[1])[2] if ranked else None
    if not fixture:
        raise LookupError(f'No se encontró {home} vs {away} en los próximos {days} días.')
    response = requests.get(f'{base}/odds', params={'apiKey': key, 'fixtureId': fixture['fixtureId'],
                            'bookmakers': 'betano', 'language': 'en', 'verbosity': 3}, timeout=20)
    response.raise_for_status()
    book = response.json().get('bookmakerOdds', {}).get('betano', {})
    if not book or book.get('suspended'):
        raise LookupError('Betano no tiene cuotas activas para este encuentro.')
    # La respuesta de odds contiene IDs numéricos. Se resuelven contra el catálogo
    # oficial de mercados, en vez de asumir que Betano use home/draw/away como ID.
    markets_response = requests.get(f'{base}/markets', params={'apiKey': key, 'sportId': 10}, timeout=20)
    markets_response.raise_for_status()
    markets_data = markets_response.json()
    markets_list = markets_data.get('data', markets_data) if isinstance(markets_data, dict) else markets_data
    market_catalog = {str(item.get('marketId')): item for item in markets_list}
    odds = {}
    all_markets = []
    mapping = {'home': 'home_win', '1': 'home_win', 'draw': 'draw', 'x': 'draw',
               'away': 'away_win', '2': 'away_win'}
    for market_id, market in book.get('markets', {}).items():
        definition = market_catalog.get(str(market_id), {})
        market_type = str(definition.get('marketType', '')).lower()
        market_name = str(definition.get('marketName', '')).lower()
        line = pd.to_numeric(definition.get('handicap'), errors='coerce')
        outcome_names = {str(item.get('outcomeId')): str(item.get('outcomeName', '')).lower()
                         for item in definition.get('outcomes', [])}
        for catalog_outcome_id, outcome in market.get('outcomes', {}).items():
            for selection in outcome.get('players', {}).values():
                bookmaker_outcome_id = str(selection.get('bookmakerOutcomeId', '')).lower()
                price = selection.get('price')
                if selection.get('active', True) and isinstance(price, (int, float)) and price > 1:
                    # Preferir el nombre normalizado del catálogo; usar el ID de
                    # Betano solo como fallback para proveedores que sí lo exponen.
                    catalog_outcome = outcome_names.get(str(catalog_outcome_id), '')
                    selection_name = catalog_outcome or bookmaker_outcome_id
                    all_markets.append({
                        'market': definition.get('marketName') or str(market_id),
                        'market_type': market_type or 'unknown',
                        'line': line,
                        'selection': catalog_outcome or bookmaker_outcome_id,
                        'odds': float(price),
                    })
                    if market_type == '1x2' and selection_name in mapping:
                        odds.setdefault(mapping[selection_name], float(price))
                    elif bookmaker_outcome_id in mapping:
                        odds.setdefault(mapping[bookmaker_outcome_id], float(price))
                    elif ('both teams' in market_name or 'btts' in market_name) and selection_name in ('yes', 'no'):
                        odds.setdefault(f'btts_{selection_name}', float(price))
                    elif market_type in ('totals', 'total') and selection_name in ('over', 'under') and line in (0.5, 1.5, 2.5, 3.5):
                        odds.setdefault(f'{selection_name}_{line:.1f}', float(price))
                    elif 'btts' in bookmaker_outcome_id and 'yes' in bookmaker_outcome_id:
                        odds.setdefault('btts_yes', float(price))
                    elif 'over' in bookmaker_outcome_id and '2.5' in bookmaker_outcome_id:
                        odds.setdefault('over_2.5', float(price))
                    elif 'under' in bookmaker_outcome_id and '2.5' in bookmaker_outcome_id:
                        odds.setdefault('under_2.5', float(price))
    if not {'home_win', 'draw', 'away_win'}.issubset(odds):
        raise LookupError('OddsPapi no devolvió un mercado 1X2 Betano reconocible.')
    return (odds, all_markets) if include_all else odds

def poisson_total_probability(expected_total, line, over=True):
    """Probabilidad de una línea asiática/europea de total sin asumir precisión falsa."""
    if not np.isfinite(expected_total) or expected_total <= 0 or line is None:
        return 0.0
    line = float(line)
    # Las líneas .5 no tienen push; para las enteras se devuelve P(win), no P(push).
    threshold = int(np.floor(line))
    return float(poisson.sf(threshold, expected_total) if over else poisson.cdf(int(np.ceil(line) - 1), expected_total))

def _asian_component_outcomes(home_lambda, away_lambda, home_handicap):
    """P(win), P(push), P(loss) para un handicap asiático entero o medio."""
    matrix = np.outer(poisson.pmf(np.arange(12), home_lambda), poisson.pmf(np.arange(12), away_lambda))
    adjusted = np.subtract.outer(np.arange(12), np.arange(12)) + home_handicap
    return float(matrix[adjusted > 0].sum()), float(matrix[np.isclose(adjusted, 0)].sum()), float(matrix[adjusted < 0].sum())

def asian_handicap_outcomes(home_lambda, away_lambda, handicap, side):
    """Maneja líneas 0, .25, .5, .75 con liquidación asiática real."""
    hcap = float(handicap)
    if str(side).lower() in ('away', '2', 'visitor', 'visitante'):
        hcap = -hcap
    quarter = round(hcap * 4)
    if abs(quarter) % 2:  # Cuartos: media apuesta en las dos líneas vecinas.
        low = (quarter - 1) / 4
        high = (quarter + 1) / 4
        first = _asian_component_outcomes(home_lambda, away_lambda, low)
        second = _asian_component_outcomes(home_lambda, away_lambda, high)
        return tuple((first[i] + second[i]) / 2 for i in range(3))
    return _asian_component_outcomes(home_lambda, away_lambda, hcap)

def asian_kelly(win_prob, push_prob, loss_prob, odds, cap=0.02):
    """Kelly numérico para asian handicap; el push conserva la banca."""
    if odds <= 1 or win_prob <= 0:
        return 0.0
    stakes = np.linspace(0, cap, 401)
    utility = win_prob * np.log1p(stakes * (odds - 1)) + loss_prob * np.log1p(-stakes)
    return float(stakes[int(np.argmax(utility))]) if np.max(utility) > 0 else 0.0

def analyze_specialty_markets(markets, predictions):
    """Valora corners, tarjetas y AH con distribuciones Poisson prepartido.

    Props de jugadores se excluyen deliberadamente: este dataset no tiene datos de
    jugadores, alineaciones ni minutos y asignarles una probabilidad sería inventarla.
    """
    recommendations = []
    home_goals, away_goals = predictions['HomeGoals'], predictions['AwayGoals']
    for item in markets:
        name = str(item.get('market', '')).lower()
        market_type = str(item.get('market_type', '')).lower()
        selection = str(item.get('selection', '')).lower()
        odds, line = item.get('odds'), item.get('line')
        if not isinstance(odds, (int, float)) or odds <= 1:
            continue
        try:
            line = float(line)
        except (TypeError, ValueError):
            line = None
        if 'corner' in name and selection in ('over', 'under') and line is not None:
            probability = poisson_total_probability(predictions['HomeCorners'] + predictions['AwayCorners'], line, selection == 'over')
            analysis = analyze_odds_value(probability, odds, f"Corners {selection.title()} {line:g}")
        elif ('card' in name or 'tarjeta' in name) and selection in ('over', 'under') and line is not None:
            probability = poisson_total_probability(predictions['HomeCards'] + predictions['AwayCards'], line, selection == 'over')
            analysis = analyze_odds_value(probability, odds, f"Tarjetas {selection.title()} {line:g}")
        elif ('handicap' in market_type or 'handicap' in name) and selection in ('home', 'away', '1', '2') and line is not None:
            win, push, loss = asian_handicap_outcomes(home_goals, away_goals, line, selection)
            ev = win * (odds - 1) - loss
            stake = asian_kelly(win, push, loss, odds)
            analysis = {'market': f"Asian Handicap {selection.title()} {line:+g}", 'prob_model': win,
                        'prob_bookie': 1 / odds, 'odds_bookie': odds,
                        'odds_fair': (1 + loss / win) if win else float('inf'), 'margin': 1 / odds - win,
                        'ev': ev, 'ev_pct': ev * 100, 'kelly_pct': stake * 100,
                        'value_rating': '✅ BUEN VALOR' if ev > .05 else '⚪ SIN VALOR',
                        'action': 'APUESTA MODERADA' if stake > 0 else 'SKIP'}
        else:
            continue
        if analysis['ev_pct'] >= 3:
            recommendations.append(analysis)
    return sorted(recommendations, key=lambda item: item['ev_pct'], reverse=True)

def input_bookmaker_odds():
    """Input interactivo de cuotas"""
    print("\n💰 INGRESO DE CUOTAS DE CASA DE APUESTAS")
    print("Ingresa las cuotas disponibles (Enter para omitir)\n")
    
    odds = {}
    markets = [
        ('home_win', '🏠 Victoria Local'),
        ('draw', '🤝 Empate'),
        ('away_win', '🛫 Victoria Visitante'),
        ('btts_yes', '✅ BTTS Sí'),
        ('over_2.5', '⚽ Over 2.5 goles'),
        ('under_2.5', '⚽ Under 2.5 goles'),
        ('over_1.5', '⚽ Over 1.5 goles'),
        ('under_1.5', '⚽ Under 1.5 goles'),
        ('1X', '🏠🤝 Doble Chance 1X'),
        ('X2', '🤝🛫 Doble Chance X2'),
    ]
    
    for key, label in markets:
        while True:
            value = input(f"{label:30s}: ").strip()
            if value == "":
                break
            try:
                odds[key] = float(value)
                break
            except:
                print("   ❌ Debe ser un número válido (ej: 2.50)")
    
    return odds if odds else None

def display_odds_analysis(analysis_list):
    """Muestra análisis de cuotas de forma profesional"""
    if not analysis_list:
        print("\n⚠️  No se ingresaron cuotas para analizar")
        return
    
    # Ordenar por EV%
    analysis_sorted = sorted(analysis_list, key=lambda x: x['ev_pct'], reverse=True)
    
    print(f"\n{'='*100}")
    print(f"💰 ANÁLISIS DE VALOR DE CUOTAS")
    print(f"{'='*100}")
    
    for i, analysis in enumerate(analysis_sorted, 1):
        emoji_map = {
            '🔥 VALOR EXCEPCIONAL': '🔥',
            '💎 EXCELENTE VALOR': '💎',
            '✅ BUEN VALOR': '✅',
            '🟡 VALOR LEVE': '🟡',
            '⚪ SIN VALOR': '⚪',
            '❌ MALA CUOTA': '❌'
        }
        emoji = emoji_map.get(analysis['value_rating'], '📊')
        
        print(f"\n{emoji} #{i} {analysis['market'].upper()}")
        print(f"{'─'*100}")
        print(f"📊 Probabilidad Modelo:    {analysis['prob_model']*100:5.1f}%  (Cuota justa: {analysis['odds_fair']:.2f})")
        print(f"🏢 Probabilidad Casa:      {analysis['prob_bookie']*100:5.1f}%  (Cuota ofrecida: {analysis['odds_bookie']:.2f})")
        print(f"{'📈' if analysis['margin'] < 0 else '📉'} Margen:                 {analysis['margin']*100:+5.1f}% {'(Sobrevaluada por casa)' if analysis['margin'] > 0 else '(Subvaluada por casa)'}")
        print(f"💵 Expected Value (EV):    {analysis['ev_pct']:+5.1f}%")
        print(f"💰 Kelly Stake:            {analysis['kelly_pct']:.1f}% del bankroll")
        print(f"🎯 Valoración:             {analysis['value_rating']}")
        print(f"🎬 ACCIÓN:                 {analysis['action']}")
        
        # Simulación de ganancia
        if analysis['ev_pct'] > 0:
            stake_100 = 100
            expected_profit = stake_100 * analysis['ev_pct'] / 100
            print(f"💡 Simulación: Apostando $100, ganancia esperada largo plazo: ${expected_profit:+.2f}")
    
    # Resumen
    print(f"\n{'='*100}")
    print(f"📊 RESUMEN")
    print(f"{'='*100}")
    
    good_bets = [a for a in analysis_list if a['ev_pct'] > 5]
    okay_bets = [a for a in analysis_list if 2 < a['ev_pct'] <= 5]
    bad_bets = [a for a in analysis_list if a['ev_pct'] <= 0]
    
    print(f"✅ Apuestas con buen valor (EV > 5%):     {len(good_bets)}")
    print(f"🟡 Apuestas con valor leve (EV 2-5%):    {len(okay_bets)}")
    print(f"❌ Apuestas sin valor (EV ≤ 0%):         {len(bad_bets)}")
    
    if good_bets:
        best = max(good_bets, key=lambda x: x['ev_pct'])
        print(f"\n🏆 MEJOR APUESTA:")
        print(f"   {best['market']} @ {best['odds_bookie']:.2f}")
        print(f"   EV: {best['ev_pct']:+.1f}% | Kelly: {best['kelly_pct']:.1f}%")
    elif okay_bets:
        print(f"\n🟡 HAY VALOR LEVE - Considerar apuestas pequeñas")
    else:
        print(f"\n❌ NO SE DETECTÓ VALOR - Recomendamos NO apostar")

def main_menu():
    """Menú principal interactivo"""
    print("\n" + "="*100)
    print("⚽ PREDICTOR PROFESIONAL DE FÚTBOL v3.0 - ANÁLISIS DE CUOTAS")
    print("="*100)
    print("\n🎯 CARACTERÍSTICAS:")
    print("   ✅ Sistema Elo Dinámico (Ataque/Defensa)")
    print("   ✅ Análisis de Expected Value (EV)")
    print("   ✅ Kelly Criterion para sizing")
    print("   ✅ Comparación con cuotas reales")
    print("   ✅ Detección automática de valor")
    print("\n" + "="*100)
    
    while True:
        print("\n📋 MENÚ PRINCIPAL")
        print("1️⃣  Predicción rápida (sin cuotas)")
        print("2️⃣  Predicción con análisis de cuotas")
        print("3️⃣  Ver equipos disponibles")
        print("4️⃣  Exportar datos del modelo (JSON)")
        print("5️⃣  Salir")
        
        choice = input("\n👉 Selecciona opción: ").strip()
        
        if choice == "1":
            predict_simple()
        elif choice == "2":
            predict_with_odds()
        elif choice == "3":
            show_available_teams()
            input("\nPresiona Enter para continuar...")
        elif choice == "4":
            export_model_data()
        elif choice == "5":
            print("\n👋 ¡Hasta luego! Apuesta responsablemente.")
            break
        else:
            print("❌ Opción inválida")

def predict_simple():
    """Predicción sin análisis de cuotas"""
    teams_list = sorted(encoder.classes_)
    
    print("\n" + "="*100)
    print("🎯 PREDICCIÓN RÁPIDA")
    print("="*100)
    
    home = select_team("🏠 Equipo Local", teams_list)
    away = select_team("🛫 Equipo Visitante", teams_list)
    league = input("🏆 Liga (opcional): ").strip() or None
    
    result = predict_with_odds_analysis(home, away, league)
    
    if result:
        display_prediction_summary(result)

def predict_with_odds():
    """Predicción con análisis de cuotas"""
    teams_list = sorted(encoder.classes_)
    
    print("\n" + "="*100)
    print("💰 PREDICCIÓN CON ANÁLISIS DE CUOTAS")
    print("="*100)
    
    home = select_team("🏠 Equipo Local", teams_list)
    away = select_team("🛫 Equipo Visitante", teams_list)
    league = input("🏆 Liga (opcional): ").strip() or None
    
    automatic = input("¿Cargar cuotas actuales de Betano automáticamente? [S/n]: ").strip().lower()
    betano_all_markets = []
    if automatic != 'n':
        try:
            bookmaker_odds, betano_all_markets = get_betano_odds(home, away, include_all=True)
            print(f"✅ Cuotas de Betano cargadas: {len(betano_all_markets)} selecciones activas | "
                  f"{len(bookmaker_odds)} mercados valorables por el modelo")
        except Exception as error:
            print(f"⚠️ No fue posible obtener Betano: {error}")
            print("Puedes introducir las cuotas manualmente como respaldo.")
            bookmaker_odds = input_bookmaker_odds()
    else:
        bookmaker_odds = input_bookmaker_odds()
    
    result = predict_with_odds_analysis(home, away, league, bookmaker_odds)
    
    if result:
        if betano_all_markets:
            specialty = analyze_specialty_markets(betano_all_markets, result['predictions'])
            result['odds_analysis'].extend(specialty)
        display_prediction_summary(result)
        if result['odds_analysis']:
            display_odds_analysis(result['odds_analysis'])

def display_prediction_summary(result):
    """Muestra resumen de predicción"""
    home = result['home']
    away = result['away']
    probs = result['model_probs']
    preds = result['predictions']
    
    print(f"\n{'='*100}")
    print(f"⚽ {home.upper()} vs {away.upper()}")
    print(f"{'='*100}")
    
    # Elo
    print(f"\n📊 ANÁLISIS DE EQUIPOS")
    print(f"{'─'*100}")
    print(f"{'Indicador':<30} | {home:<30} | {away}")
    print(f"{'─'*100}")
    print(f"{'Elo Ataque':<30} | {result['elo']['home_attack']:>30.0f} | {result['elo']['away_attack']:.0f}")
    print(f"{'Elo Defensa':<30} | {result['elo']['home_defense']:>30.0f} | {result['elo']['away_defense']:.0f}")
    
    # Probabilidades resultado
    print(f"\n🎲 PROBABILIDADES DE RESULTADO")
    print(f"{'─'*100}")
    print(f"🏠 Victoria {home:<20}: {probs['home_win']*100:5.1f}%  (Cuota justa: {prob_to_odds(probs['home_win']):.2f})")
    print(f"🤝 Empate{'':<25}: {probs['draw']*100:5.1f}%  (Cuota justa: {prob_to_odds(probs['draw']):.2f})")
    print(f"🛫 Victoria {away:<20}: {probs['away_win']*100:5.1f}%  (Cuota justa: {prob_to_odds(probs['away_win']):.2f})")
    
    print(f"\n💫 Doble Chance:")
    print(f"   1X: {probs['1X']*100:5.1f}% (≈ {prob_to_odds(probs['1X']):.2f})")
    print(f"   X2: {probs['X2']*100:5.1f}% (≈ {prob_to_odds(probs['X2']):.2f})")
    print(f"   12: {probs['12']*100:5.1f}% (≈ {prob_to_odds(probs['12']):.2f})")
    
    # BTTS
    print(f"\n⚡ AMBOS MARCAN (BTTS)")
    print(f"{'─'*100}")
    print(f"✅ Sí:  {probs['btts_yes']*100:5.1f}%  (Cuota justa: {prob_to_odds(probs['btts_yes']):.2f})")
    print(f"❌ No:  {probs['btts_no']*100:5.1f}%  (Cuota justa: {prob_to_odds(probs['btts_no']):.2f})")
    
    # Líneas de goles
    print(f"\n⚽ LÍNEAS DE GOLES")
    print(f"{'─'*100}")
    for line in [0.5, 1.5, 2.5, 3.5]:
        over_key = f'over_{line}'
        under_key = f'under_{line}'
        if over_key in probs and under_key in probs:
            print(f"Over {line:3.1f}:  {probs[over_key]*100:5.1f}%  (≈ {prob_to_odds(probs[over_key]):.2f})  |  Under {line:3.1f}: {probs[under_key]*100:5.1f}%  (≈ {prob_to_odds(probs[under_key]):.2f})")
    
    # Stats esperadas
    print(f"\n📈 ESTADÍSTICAS ESPERADAS")
    print(f"{'─'*100}")
    print(f"⚽ Goles:        {preds['HomeGoals']:.2f} - {preds['AwayGoals']:.2f} (Total: {preds['HomeGoals']+preds['AwayGoals']:.2f})")
    print(f"📊 Tiros:        {preds['HomeShots']:.1f} - {preds['AwayShots']:.1f} (Total: {preds['HomeShots']+preds['AwayShots']:.1f})")
    print(f"🎯 Tiros/Puerta: {preds['HomeShotsOnTarget']:.1f} - {preds['AwayShotsOnTarget']:.1f}")
    print(f"🚩 Corners:      {preds['HomeCorners']:.1f} - {preds['AwayCorners']:.1f}")
    print(f"🟨 Tarjetas:     {preds['HomeCards']:.1f} - {preds['AwayCards']:.1f}")

def export_model_data():
    """Exporta probabilidades y datos del modelo"""
    print("\n📤 EXPORTAR DATOS DEL MODELO")
    print("Esta función te permite obtener un JSON con todas las probabilidades")
    print("para integrarlo con tu frontend o sistema externo.\n")
    
    teams_list = sorted(encoder.classes_)
    home = select_team("🏠 Equipo Local", teams_list)
    away = select_team("🛫 Equipo Visitante", teams_list)
    league = input("🏆 Liga (opcional): ").strip() or None
    
    result = predict_with_odds_analysis(home, away, league)
    
    if result:
        # Preparar datos para export
        export_data = {
            'match': {
                'home': home,
                'away': away,
                'league': league,
                'timestamp': datetime.now().isoformat()
            },
            'probabilities': {
                'result': {
                    'home_win': result['model_probs']['home_win'],
                    'draw': result['model_probs']['draw'],
                    'away_win': result['model_probs']['away_win']
                },
                'double_chance': {
                    '1X': result['model_probs']['1X'],
                    'X2': result['model_probs']['X2'],
                    '12': result['model_probs']['12']
                },
                'btts': {
                    'yes': result['model_probs']['btts_yes'],
                    'no': result['model_probs']['btts_no']
                },
                'goals': {
                    'over_0.5': result['model_probs']['over_0.5'],
                    'over_1.5': result['model_probs']['over_1.5'],
                    'over_2.5': result['model_probs']['over_2.5'],
                    'over_3.5': result['model_probs']['over_3.5'],
                    'under_0.5': result['model_probs']['under_0.5'],
                    'under_1.5': result['model_probs']['under_1.5'],
                    'under_2.5': result['model_probs']['under_2.5'],
                    'under_3.5': result['model_probs']['under_3.5']
                }
            },
            'fair_odds': {
                key: prob_to_odds(prob) 
                for key, prob in result['model_probs'].items()
            },
            'predictions': result['predictions'],
            'elo_ratings': result['elo']
        }
        
        filename = f"prediction_{home.replace(' ', '_')}_vs_{away.replace(' ', '_')}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(export_data, f, indent=2, ensure_ascii=False)
        
        print(f"\n✅ Datos exportados exitosamente:")
        print(f"📁 Archivo: {filename}")
        print(f"\n💡 Este archivo puede ser usado para:")
        print(f"   - Integración con frontend React/Next.js")
        print(f"   - APIs de terceros")
        print(f"   - Análisis posterior")
        print(f"   - Backtesting")

# ============================================================================
# FUNCIÓN PARA API/FRONTEND
# ============================================================================

def api_predict(home, away, league=None, bookmaker_odds=None):
    """
    Función para usar desde API o frontend
    Retorna JSON con toda la información necesaria
    """
    result = predict_with_odds_analysis(home, away, league, bookmaker_odds)
    
    if not result:
        return {'error': 'Teams not found'}
    
    # Agregar cuotas justas
    result['fair_odds'] = {
        key: prob_to_odds(prob)
        for key, prob in result['model_probs'].items()
    }
    
    # Si hay análisis de cuotas, incluir recomendaciones
    if result['odds_analysis']:
        best_bets = [a for a in result['odds_analysis'] if a['ev_pct'] > 5]
        result['recommendations'] = {
            'best_bets': sorted(best_bets, key=lambda x: x['ev_pct'], reverse=True),
            'has_value': len(best_bets) > 0,
            'total_value_bets': len(best_bets)
        }
    
    return result

# ============================================================================
# FUNCIÓN PARA OBTENER LISTA DE EQUIPOS (útil para frontend)
# ============================================================================

def get_teams_list():
    """Retorna lista de equipos disponibles"""
    return {
        'teams': sorted(encoder.classes_.tolist()),
        'total': len(encoder.classes_)
    }

def get_leagues_list():
    """Retorna lista de ligas disponibles"""
    if has_league and 'League' in df.columns:
        return {
            'leagues': sorted(df['League'].unique().tolist()),
            'total': df['League'].nunique()
        }
    return {'leagues': [], 'total': 0}

# ============================================================================
# EJECUTAR APLICACIÓN
# ============================================================================

if __name__ == "__main__":
    main_menu()



