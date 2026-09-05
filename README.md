# Futibet ⚽

> Premium AI-powered football intelligence and analytics platform.
## What is Futibet?

Futibet is a football analytics platform that combines **machine learning predictions** with **real-time market odds** to surface value bets across the major European and South American football leagues.

It is not a gambling site. It is an intelligence tool — built for people who approach sports betting as a data problem, not a luck game.

## Features

### Match Calendar
- Daily fixture grid sourced from **football-data.org** and **TheSportsDB**
- Covers Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League, Europa League, Copa del Rey, Coppa Italia, DFB-Pokal, Coupe de France, Liga Profesional Argentina, Liga Betplay Colombia, and more
- Real team logos from official sources
- Date ribbon to navigate between days

### AI Analysis
- **Quick analysis** — 2-3 sentence summary with main pick and confidence score
- **Detailed analysis** — full structured report including team form, market analysis, value opportunities, and final recommendation with bankroll management suggestion
- Powered by **Groq (Llama 3.3 70B)** with a structured data-driven prompt
- Analysis cached in Supabase for 6 hours — no redundant API calls

### ML Predictions (Match Predictor Service)
- A single **Python FastAPI service** in `match-predictor-service/`, deployed on Railway
- Uses the historical Football-Data CSVs bundled with the service
- Time-aware Elo, calibrated 1X2 probabilities, Poisson goal models and risk-limited Kelly sizing
- Betano markets are retrieved server-side via OddsPapi; API credentials never reach the browser
- The model values 1X2, goals, BTTS, total corners, total cards and Asian handicaps. Player props are displayed but intentionally not recommended without player-level data.

### Value Bet Detection
- Real Betano odds sourced server-side through **OddsPapi**
- Expected Value calculated per outcome: `EV = (model_probability × odds) - 1`
- Positive EV bets highlighted in the best picks table

### Betting Portfolio
- Personal bankroll tracker — log bets with market, stake, odds, and result
- Grouped by day with daily net result
- Metrics: Bankroll, Total Profit/Loss, ROI, Win Rate
- Bankroll evolution chart

### Analytics
- ROI evolution over time
- Monthly performance bar chart
- Win rate trend
- Breakdown by league and market type

### Design
- Apple-inspired **Liquid Glass** design system
- `backdrop-blur-2xl`, `bg-white/50`, `border-white/60` on every card
- **Framer Motion** animations throughout — page transitions, card hover, modal enter/exit, progress bar fill
- Inter font with SF Pro Display fallback
- Fully responsive

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | TanStack Start, React 19, TypeScript |
| Styling | Tailwind CSS v4, Framer Motion |
| UI Components | shadcn/ui, Radix UI |
| Charts | Recharts |
| Auth & Database | Supabase (Google + GitHub OAuth) |
| Deployment | Cloudflare Workers |
| ML Microservice | Python, FastAPI, scikit-learn, XGBoost |
| ML Deployment | Railway |
| LLM | Groq API — Llama 3.3 70B Versatile |
| Football Data | football-data.org, TheSportsDB |
| Odds Data | The Odds API |

---

## Architecture
