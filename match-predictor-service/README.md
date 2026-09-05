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
python global_match_predictor.py
```

El terminal pide liga, equipo local y visitante. Las ligas admitidas son `ES`,
`E0`, `I1`, `F1`, `D1`, `BR` y `ARG`.

## Variables de entorno

En Railway configura `ODDSPAPI_API_KEY`. La clave nunca se expone al navegador.
El frontend debe tener `MATCH_PREDICTOR_API_URL` apuntando a esta API pública.
