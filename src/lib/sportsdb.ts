export interface SportsDBEvent {
  idEvent: string;
  strEvent?: string;
  strHomeTeam: string;
  strAwayTeam: string;
  strHomeTeamBadge?: string | null;
  strAwayTeamBadge?: string | null;
  strLeague: string;
  dateEvent: string;
  strTime?: string | null;
  strStatus?: string | null;
  intHomeScore?: string | null;
  intAwayScore?: string | null;
}

const BASE = "https://www.thesportsdb.com/api/v1/json/3";

const ALLOWED_LEAGUES = new Set<string>([
  "UEFA Champions League",
  "UEFA Europa League",
  "English Premier League",
  "La Liga",
  "Spanish La Liga",
  "Serie A",
  "Italian Serie A",
  "Bundesliga",
  "German Bundesliga",
  "Ligue 1",
  "French Ligue 1",
  "FA Cup",
  "Copa del Rey",
  "Coppa Italia",
  "DFB-Pokal",
  "Coupe de France",
  "Copa Libertadores",
  "Copa Sudamericana",
  "Liga MX",
  "Mexican Primera League",
  "Brasileirao",
  "Brazilian Serie A",
  "NBA",
  "American NBA",
  "MLB",
  "American MLB",
]);

function mapStatus(s?: string | null): "scheduled" | "live" | "finished" {
  if (!s) return "scheduled";
  const v = s.toLowerCase();
  if (["ft", "finished", "match finished", "aet", "pen"].some((k) => v.includes(k))) return "finished";
  if (["1h", "2h", "ht", "live", "in play"].some((k) => v.includes(k))) return "live";
  return "scheduled";
}

async function fetchSport(date: string, sport: string): Promise<SportsDBEvent[]> {
  try {
    const res = await fetch(`${BASE}/eventsday.php?d=${date}&s=${sport}`);
    if (!res.ok) return [];
    const json = (await res.json()) as { events?: SportsDBEvent[] | null };
    return json.events ?? [];
  } catch {
    return [];
  }
}

export async function fetchEventsByDate(date: string): Promise<SportsDBEvent[]> {
  try {
    const [soccer, basketball, baseball] = await Promise.all([
      fetchSport(date, "Soccer"),
      fetchSport(date, "Basketball"),
      fetchSport(date, "Baseball"),
    ]);
    const all = [...soccer, ...basketball, ...baseball];
    return all
      .filter((e) => e && e.strLeague && ALLOWED_LEAGUES.has(e.strLeague))
      .map((e) => ({ ...e, strStatus: mapStatus(e.strStatus) }));
  } catch {
    return [];
  }
}

export async function fetchEventById(id: string): Promise<SportsDBEvent | null> {
  try {
    const res = await fetch(`${BASE}/lookupevent.php?id=${id}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { events?: SportsDBEvent[] | null };
    const ev = json.events?.[0];
    if (!ev) return null;
    return { ...ev, strStatus: mapStatus(ev.strStatus) };
  } catch {
    return null;
  }
}

// Deterministic plausible odds from event id
export function generateOdds(id: string): { home: string; draw: string; away: string } {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const a = 1.5 + ((h % 250) / 100); // 1.50 - 3.99
  const b = 2.8 + (((h >> 8) % 150) / 100);
  const c = 1.6 + (((h >> 16) % 280) / 100);
  return { home: a.toFixed(2), draw: b.toFixed(2), away: c.toFixed(2) };
}

// Deterministic confidence 30 - 92
export function generateConfidence(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 17 + id.charCodeAt(i)) >>> 0;
  return 30 + (h % 63);
}