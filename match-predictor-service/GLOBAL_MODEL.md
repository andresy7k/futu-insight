# Modelo global y contrato de interfaz

`global_match_predictor.py` conserva el modo terminal y unifica ES, E0, I1,
F1, D1, BR y ARG. Entrena un modelo separado por liga, sin mezclar sus tasas
de gol, ventaja de localía o equipos. Cada modelo usa Elo temporal, forma con
decaimiento, descanso, Poisson para goles y probabilidades 1X2 calibradas.

## Política de mercados

| Grupo | Datos disponibles | Mercados que pueden recibir recomendación |
| --- | --- | --- |
| ES, E0, I1, F1, D1 | Marcador, tiros, córners, faltas y tarjetas | 1X2, doble oportunidad, goles, BTTS, hándicap asiático, córners y tarjetas |
| BR, ARG | Marcador y cuotas históricas; sin eventos de partido | 1X2, doble oportunidad, goles, BTTS y hándicap asiático |

Props de jugador nunca deben marcarse como valor: los CSV no incluyen jugadores,
minutos, alineaciones, lesiones o tiros individuales.

## Flujo para el frontend

El calendario ya conoce `homeTeam`, `awayTeam`, `league` y `matchId`. No se
pide ningún dato al usuario. Al pulsar una acción, el frontend envía esos cuatro
campos al backend.

`Análisis` muestra el único pick con mayor EV que supere el umbral y el límite
de riesgo. Si no existe, muestra `Sin apuesta recomendada`.

`Análisis detallado` muestra cuatro grupos, en este orden: `alto valor` (EV
>=10%), `valor` (EV 5-10%), `valor leve` (EV 3-5%) y `no recomendado` (EV <3%,
mercado sin cobertura o props). El backend debe enviar las cuotas Betano y los
mercados bloqueados por cobertura para que la interfaz no invente picks.
