# Match Predictor Service

Servicio único de predicción para Futi Insight. Se despliega en Railway y el
frontend le envía el partido elegido en el calendario.

```text
match-predictor-service/
├── main.py                    # API FastAPI: /health, /leagues, /global-predict
├── global_match_predictor.py  # Modelo temporal global y CLI
├── betano_client.py           # Cuotas Betano vía OddsPapi, solo en servidor
├── data/                      # Dataset histórico, organizado por código de liga
│   ├── ES/  E0/  I1/  F1/  D1/
│   └── BR/  ARG/
├── .env.example               # Variables requeridas, sin secretos
├── requirements.txt
└── railway.json
```

## Terminal local

Desde esta carpeta:

```powershell
# Menú visual histórico: España y opción 5 para el predictor global visual.
python match_predictor_full.py

# CLI técnica directa del modelo global (salida JSON).
python global_match_predictor.py
```

El modo global admite `ES`, `E0`, `I1`, `F1`, `D1`, `BR` y `ARG`.

## Variables de entorno

En Railway configura `ODDSPAPI_API_KEY` y `ODDS_API_KEY` (The Odds API). La
clave nunca se expone al navegador. El orden de consulta es Betano/OddsPapi y,
si no responde, The Odds API con mercados 1X2, totales y hándicaps disponibles.
El frontend debe tener `MATCH_PREDICTOR_API_URL` apuntando a esta API pública.

Las cuotas manuales del administrador se guardan en Supabase y tienen prioridad
para ese partido. Aplica antes la migración
`supabase/migrations/20260905223000_admin_manual_match_inputs.sql`.
