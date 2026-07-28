import type { SportsDBEvent } from "./sportsdb";

export interface AnalysisResult {
  match_id?: string;
  main_pick?: string;
  confidence_score?: number;
  risk_level?: "low" | "medium" | "high";
  quick_summary?: string;
  deep_analysis?: {
    team_form?: string;
    market_analysis?: string;
    value_opportunities?: string;
    final_recommendation?: string;
  };
  best_picks?: Array<{
    market?: string;
    pick?: string;
    odds?: number;
    ev?: number;
    reasoning?: string;
  }>;
  ml_probabilities?: { home: number; draw: number; away: number } | null;
  odds?: { home: number; draw: number; away: number } | null;
  model_used?: string;
  generated_at?: string;
  cached?: boolean;
  error?: string;
}

export async function fetchAnalysis(
  event: SportsDBEvent,
  mode: "quick" | "deep",
): Promise<AnalysisResult | null> {
  try {
    const resp = await fetch("/api/analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        matchId: event.idEvent,
        homeTeam: event.strHomeTeam,
        awayTeam: event.strAwayTeam,
        league: event.strLeague,
        matchDate: event.dateEvent,
        mode,
      }),
    });
    if (!resp.ok) return null;
    return (await resp.json()) as AnalysisResult;
  } catch {
    return null;
  }
}