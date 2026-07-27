# ProphitBet API

FastAPI microservice serving ensemble (RandomForest + XGBoost) soccer match
predictions for the Futibet app. Historical match data is downloaded from
[football-data.co.uk](https://www.football-data.co.uk/).

## Supported leagues

| Code | League                    |
|------|---------------------------|
| E0   | English Premier League    |
| SP1  | La Liga                   |
| I1   | Serie A                   |
| D1   | Bundesliga                |
| F1   | Ligue 1                   |

## Endpoints

- `GET /health` — service status + loaded models
- `GET /leagues` — supported leagues
- `POST /predict` — body `{ home_team, away_team, league }`
- `GET /retrain/{league_code}` — kicks off async retraining

## Local development

```bash
cd prophitbet-api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

On startup the service trains any missing / stale (>7 days) models in a
background thread, then loads them into memory. The API is available
immediately at `/health`; predictions become available as each league
finishes training.

## Deploy to Railway (no CLI required)

1. Create an account at [railway.app](https://railway.app).
2. Push this `prophitbet-api/` folder to a GitHub repo.
3. In Railway: **New Project → Deploy from GitHub repo**, pick the repo.
4. Railway auto-detects `Procfile` / `railway.json` and deploys with
   Nixpacks. First boot trains models — this can take several minutes.
5. Once green, copy the generated public URL
   (e.g. `https://prophitbet-api-production.up.railway.app`).
6. In Vercel, set `PROPHITBET_API_URL` to that URL for the Futibet project
   and redeploy.

### CLI alternative

```bash
npm install -g @railway/cli
railway login
railway init
railway up
railway open
```

## Environment variables

See `.env.example`. Only `PORT` is required (Railway sets it automatically).

## Notes

- Trained models and CSV caches live under `storage/` and are gitignored.
- Prediction labels: `H` = home win, `D` = draw, `A` = away win.
- Confidence risk buckets: `>70` low, `50–70` medium, `<50` high.