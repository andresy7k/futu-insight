import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// ============================================================================
// Types
// ============================================================================

interface AnalysisBody {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  matchDate?: string;
  mode?: string;
}

interface MarketOdds {
  home: number;
  draw: number;
  away: number;
}

interface MlPrediction {
  prediction: "H" | "D" | "A";
  probabilities: { home: number; draw: number; away: number };
  confidence: number;
  risk_level: "low" | "medium" | "high";
}

// ============================================================================
// League / sport key maps
// ============================================================================

const SPORT_KEY_MAP: Record<string, string> = {
  "Premier League": "soccer_epl",
  "English Premier League": "soccer_epl",
  "Primera Division": "soccer_spain_la_liga",
  "La Liga": "soccer_spain_la_liga",
  "Serie A": "soccer_italy_serie_a",
  Bundesliga: "soccer_germany_bundesliga",
  "Ligue 1": "soccer_france_ligue_one",
  "UEFA Champions League": "soccer_uefa_champs_league",
  "UEFA Europa League": "soccer_uefa_europa_league",
  "UEFA Europa Conference League": "soccer_uefa_europa_conference_league",
  "Copa Libertadores": "soccer_conmebol_libertadores",
  NBA: "basketball_nba",
  MLB: "baseball_mlb",
};

const LEAGUE_CODE_MAP: Record<string, string> = {
  "Premier League": "E0",
  "English Premier League": "E0",
  "Primera Division": "SP1",
  "La Liga": "SP1",
  "Serie A": "I1",
  Bundesliga: "D1",
  "Ligue 1": "F1",
};

// ============================================================================
// Fuzzy team matching (tiny local implementation)
// ============================================================================

function normalize(name: string) {
  return name
    .toLowerCase()
    .replace(/\b(fc|cf|sc|afc|club|de|the)\b/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a: string, b: string): number {
    const A = normalize(a);
    const B = normalize(b);
    if (!A || !B) return 0;
    if (A === B) return 1;
    if (A.includes(B) || B.includes(A)) return 0.85;
    const setA = new Set(A.split(" "));
    const setB = new Set(B.split(" "));
    let overlap = 0;
    setA.forEach((t) => {
      if (setB.has(t)) overlap++;
    });
    return overlap / Math.max(setA.size, setB.size);
}

// ============================================================================
// Odds fetching (The Odds API)
// ============================================================================

async function fetchMarketOdds(
  league: string,
  homeTeam: string,
  awayTeam: string,
): Promise<MarketOdds | null> {
  const apiKey = process.env.ODDS_API_KEY;
  const sportKey = SPORT_KEY_MAP[league];
  if (!apiKey || !sportKey) return null;
  try {
    const url = new URL(`https://api.the-odds-api.com/v4/sports/${sportKey}/odds`);
    url.searchParams.set("apiKey", apiKey);
    url.searchParams.set("regions", "eu");
    url.searchParams.set("markets", "h2h");
    url.searchParams.set("dateFormat", "iso");
    const resp = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) return null;
    const events = (await resp.json()) as Array<{
      home_team: string;
      away_team: string;
      bookmakers: Array<{
        markets: Array<{ key: string; outcomes: Array<{ name: string; price: number }> }>;
      }>;
    }>;

    let best: (typeof events)[number] | null = null;
    let bestScore = 0;
    for (const ev of events) {
      const score =
        (similarity(ev.home_team, homeTeam) + similarity(ev.away_team, awayTeam)) / 2;
      if (score > bestScore) {
        bestScore = score;
        best = ev;
      }
    }
    if (!best || bestScore < 0.55) return null;

    const bookmaker = best.bookmakers?.[0];
    const market = bookmaker?.markets.find((m) => m.key === "h2h");
    if (!market) return null;
    let home = 0,
      draw = 0,
      away = 0;
    for (const o of market.outcomes) {
      if (similarity(o.name, best.home_team) > 0.8) home = o.price;
      else if (similarity(o.name, best.away_team) > 0.8) away = o.price;
      else if (/draw|tie/i.test(o.name)) draw = o.price;
    }
    if (!home || !away) return null;
    return { home, draw: draw || 0, away };
  } catch (e) {
    console.error("[analysis] odds fetch failed", e);
    return null;
  }
}

// ============================================================================
// ML microservice
// ============================================================================

async function fetchMlPrediction(
  league: string,
  homeTeam: string,
  awayTeam: string,
): Promise<MlPrediction | null> {
  const base = process.env.PROPHITBET_API_URL;
  const code = LEAGUE_CODE_MAP[league];
  if (!base || !code) return null;
  try {
    const resp = await fetch(`${base.replace(/\/$/, "")}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ home_team: homeTeam, away_team: awayTeam, league: code }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as any;
    if (data?.fallback === true || data?.supported === false) return null;
    if (!data?.probabilities) return null;
    return {
      prediction: data.prediction,
      probabilities: data.probabilities,
      confidence: data.confidence,
      risk_level: data.risk_level,
    };
  } catch (e) {
    console.error("[analysis] ML fetch failed", e);
    return null;
  }
}

// ============================================================================
// Groq LLM
// ============================================================================

function buildPrompt(
  body: AnalysisBody,
  odds: MarketOdds | null,
  ml: MlPrediction | null,
) {
  const { homeTeam, awayTeam, league, matchDate } = body;
  const oddsBlock = odds
    ? `
CUOTAS REALES DEL MERCADO (The Odds API):
${homeTeam}: ${odds.home}
Empate: ${odds.draw}
${awayTeam}: ${odds.away}
Probabilidad implícita local: ${((1 / odds.home) * 100).toFixed(1)}%
Probabilidad implícita empate: ${odds.draw ? ((1 / odds.draw) * 100).toFixed(1) : "n/d"}%
Probabilidad implícita visitante: ${((1 / odds.away) * 100).toFixed(1)}%
`
    : "Cuotas de mercado no disponibles para este partido.";

  const mlBlock = ml
    ? `
PREDICCIÓN DEL MODELO ML (entrenado con datos históricos reales de football-data.co.uk):
Probabilidad victoria ${homeTeam}: ${(ml.probabilities.home * 100).toFixed(1)}%
Probabilidad empate: ${(ml.probabilities.draw * 100).toFixed(1)}%
Probabilidad victoria ${awayTeam}: ${(ml.probabilities.away * 100).toFixed(1)}%
Predicción del modelo: ${ml.prediction}
Confianza del modelo: ${ml.confidence.toFixed(1)}%
${
  odds
    ? `
DETECCIÓN DE VALUE BET:
Probabilidad modelo local vs implícita mercado: ${(ml.probabilities.home * 100).toFixed(1)}% vs ${((1 / odds.home) * 100).toFixed(1)}%
Probabilidad modelo empate vs implícita mercado: ${(ml.probabilities.draw * 100).toFixed(1)}% vs ${odds.draw ? ((1 / odds.draw) * 100).toFixed(1) : "n/d"}%
Probabilidad modelo visitante vs implícita mercado: ${(ml.probabilities.away * 100).toFixed(1)}% vs ${((1 / odds.away) * 100).toFixed(1)}%
EV local = (prob_modelo × cuota) - 1 = ${(ml.probabilities.home * (odds.home || 0) - 1).toFixed(3)}
EV empate = ${(ml.probabilities.draw * (odds.draw || 0) - 1).toFixed(3)}
EV visitante = ${(ml.probabilities.away * (odds.away || 0) - 1).toFixed(3)}
`
    : ""
}
`
    : "Modelo ML no disponible para esta competición — basa el análisis en contexto general.";

  return `
Actúa como un analista profesional de apuestas deportivas inspirado en Billy Walters.
Tu análisis debe basarse ÚNICAMENTE en los datos reales proporcionados, no en suposiciones.

PARTIDO: ${homeTeam} vs ${awayTeam}
COMPETICIÓN: ${league}
FECHA: ${matchDate ?? "por determinar"}

${oddsBlock}

${mlBlock}

Responde SOLO con este JSON, sin texto adicional:
{
  "main_pick": "mercado y selección recomendada",
  "confidence_score": número 0-100 basado en los datos disponibles,
  "risk_level": "low"|"medium"|"high",
  "quick_summary": "2-3 oraciones citando datos reales del análisis",
  "deep_analysis": {
    "team_form": "análisis basado en probabilidades del modelo si disponible",
    "market_analysis": "comparación entre modelo ML y cuotas para identificar value",
    "value_opportunities": "apuestas con EV positivo con sus valores exactos",
    "final_recommendation": "pick final con stake sugerido (% de bankroll)"
  },
  "best_picks": [
    {
      "market": "1X2|Over/Under|BTTS",
      "pick": "selección específica",
      "odds": número,
      "ev": número,
      "reasoning": "justificación con datos"
    }
  ]
}
`.trim();
}

function stripJsonFences(text: string): string {
  return text
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

async function callGroq(prompt: string): Promise<any | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  try {
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 1500,
        temperature: 0.2,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!resp.ok) {
      console.error("[analysis] groq status", resp.status);
      return null;
    }
    const data = (await resp.json()) as any;
    const raw = data?.choices?.[0]?.message?.content;
    if (!raw) return null;
    return JSON.parse(stripJsonFences(raw));
  } catch (e) {
    console.error("[analysis] groq failed", e);
    return null;
  }
}

// ============================================================================
// Supabase (service-role for cache read/write)
// ============================================================================

function getAdminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (
          (key.startsWith("sb_secret_") || key.startsWith("sb_publishable_")) &&
          h.get("Authorization") === `Bearer ${key}`
        ) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

// ============================================================================
// Handler
// ============================================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const Route = createFileRoute("/api/analysis")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as AnalysisBody;
          if (!body?.matchId || !body?.homeTeam || !body?.awayTeam || !body?.league) {
            return Response.json(
              { error: "matchId, homeTeam, awayTeam, league are required" },
              { status: 400, headers: CORS },
            );
          }

          const admin = getAdminClient();

          // 1. Cache lookup
          if (admin) {
            try {
              const { data: cached } = await admin
                .from("predictions")
                .select("*")
                .eq("match_id", body.matchId)
                .maybeSingle();
              if (cached?.generated_at) {
                const age = Date.now() - new Date(cached.generated_at).getTime();
                if (age < CACHE_TTL_MS && cached.payload) {
                  return Response.json(
                    { ...(cached.payload as object), cached: true },
                    { headers: CORS },
                  );
                }
              }
            } catch (e) {
              console.error("[analysis] cache read failed", e);
            }
          }

          // 2. Odds + ML in parallel
          const [odds, ml] = await Promise.all([
            fetchMarketOdds(body.league, body.homeTeam, body.awayTeam),
            fetchMlPrediction(body.league, body.homeTeam, body.awayTeam),
          ]);

          // 3. Groq
          const prompt = buildPrompt(body, odds, ml);
          const parsed = await callGroq(prompt);

          if (!parsed) {
            return Response.json(
              {
                match_id: body.matchId,
                error: "analysis_unavailable",
                ml_probabilities: ml?.probabilities ?? null,
                odds,
              },
              { status: 200, headers: CORS },
            );
          }

          const result = {
            match_id: body.matchId,
            main_pick: parsed.main_pick,
            confidence_score: ml?.confidence ?? parsed.confidence_score,
            risk_level: ml?.risk_level ?? parsed.risk_level,
            quick_summary: parsed.quick_summary,
            deep_analysis: parsed.deep_analysis,
            best_picks: parsed.best_picks,
            ml_probabilities: ml?.probabilities ?? null,
            odds,
            model_used: ml ? "ensemble+llm" : "llm_only",
            generated_at: new Date().toISOString(),
          };

          // 4. Persist to cache
          if (admin) {
            try {
              await admin.from("predictions").upsert(
                {
                  match_id: body.matchId,
                  home_team: body.homeTeam,
                  away_team: body.awayTeam,
                  league: body.league,
                  main_pick: result.main_pick ?? null,
                  confidence_score: result.confidence_score ?? null,
                  risk_level: result.risk_level ?? null,
                  quick_summary: result.quick_summary ?? null,
                  deep_analysis: result.deep_analysis ?? null,
                  best_picks: result.best_picks ?? null,
                  ml_probabilities: result.ml_probabilities ?? null,
                  model_used: result.model_used,
                  payload: result as unknown as Database["public"]["Tables"]["predictions"]["Insert"]["payload"],
                  generated_at: result.generated_at,
                },
                { onConflict: "match_id" },
              );
            } catch (e) {
              console.error("[analysis] cache write failed", e);
            }
          }

          return Response.json(result, { headers: CORS });
        } catch (e) {
          console.error("[analysis] handler error", e);
          return Response.json(
            { error: "internal_error" },
            { status: 200, headers: CORS },
          );
        }
      },
    },
  },
});