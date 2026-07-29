import { createFileRoute } from "@tanstack/react-router";

// Server proxy for football-data.org so we can keep the API token server-side
// and avoid CORS issues. Falls back gracefully when the key is missing.

const ALLOWED_COMPETITIONS = new Set<string>([
  "Premier League",
  "Primera Division",
  "Serie A",
  "Bundesliga",
  "Ligue 1",
  "UEFA Champions League",
  "UEFA Europa League",
  "UEFA Europa Conference League",
  "Copa del Rey",
  "Coppa Italia",
  "DFB-Pokal",
  "Coupe de France",
  "Eredivisie",
  "Primeira Liga",
]);

function mapStatus(s?: string | null): "scheduled" | "live" | "finished" {
  if (!s) return "scheduled";
  const v = s.toUpperCase();
  if (["FINISHED", "AWARDED"].includes(v)) return "finished";
  if (["IN_PLAY", "PAUSED", "LIVE"].includes(v)) return "live";
  return "scheduled";
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const Route = createFileRoute("/api/matches")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const date = url.searchParams.get("date");
          if (!date) {
            return Response.json({ events: [] }, { headers: CORS });
          }
          const token = process.env.FOOTBALL_DATA_API_KEY;
          if (!token) {
            return Response.json({ events: [], reason: "missing_token" }, { headers: CORS });
          }

          const apiUrl = `https://api.football-data.org/v4/matches?dateFrom=${date}&dateTo=${date}`;
          const resp = await fetch(apiUrl, {
            headers: { "X-Auth-Token": token },
            signal: AbortSignal.timeout(10_000),
          });
          if (!resp.ok) {
            return Response.json({ events: [], reason: `upstream_${resp.status}` }, { headers: CORS });
          }
          const data = (await resp.json()) as {
            matches?: Array<{
              id: number;
              utcDate: string;
              status: string;
              competition?: { name?: string };
              homeTeam?: { name?: string; crest?: string };
              awayTeam?: { name?: string; crest?: string };
              score?: { fullTime?: { home?: number | null; away?: number | null } };
            }>;
          };

          const events = (data.matches ?? [])
            .filter((m) => m.competition?.name && ALLOWED_COMPETITIONS.has(m.competition.name))
            .map((m) => {
              const [d, t] = (m.utcDate ?? "").split("T");
              return {
                idEvent: `fd-${m.id}`,
                strHomeTeam: m.homeTeam?.name ?? "",
                strAwayTeam: m.awayTeam?.name ?? "",
                strHomeTeamBadge: m.homeTeam?.crest ?? null,
                strAwayTeamBadge: m.awayTeam?.crest ?? null,
                strLeague: m.competition?.name ?? "",
                dateEvent: d ?? date,
                strTime: t ? t.slice(0, 5) : null,
                strStatus: mapStatus(m.status),
                intHomeScore:
                  m.score?.fullTime?.home != null ? String(m.score.fullTime.home) : null,
                intAwayScore:
                  m.score?.fullTime?.away != null ? String(m.score.fullTime.away) : null,
              };
            });

          return Response.json({ events }, { headers: CORS });
        } catch (e) {
          console.error("[matches] handler error", e);
          return Response.json({ events: [], reason: "internal_error" }, { headers: CORS });
        }
      },
    },
  },
});