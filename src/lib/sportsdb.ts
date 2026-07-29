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

// South American / niche leagues we fetch from TheSportsDB (football-data.org
// free tier does not cover them). Match against the exact strings TheSportsDB
// returns — several regional variants included.
const SA_SOCCER_LEAGUES = new Set<string>([
  "Argentinian Primera Division",
	"English Premier League",
	"Colombian Liga Dimayor",
	"Brazilian Serie A",
	"Copa Libertadores",
	"Copa Sudamericana",
	"UEFA Champions League",
	"Copa Ecuador",
]);

const NBA_LEAGUES = new Set<string>(["NBA", "American NBA"]);
const MLB_LEAGUES = new Set<string>(["MLB", "American MLB"]);

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

async function fetchFootballDataOrg(date: string): Promise<SportsDBEvent[]> {
  try {
    const res = await fetch(`/api/matches?date=${date}`);
    if (!res.ok) return [];
    const json = (await res.json()) as { events?: SportsDBEvent[] };
    return (json.events ?? []).map((e) => ({ ...e, strStatus: mapStatus(e.strStatus) }));
  } catch {
    return [];
  }
}

function dedupe(events: SportsDBEvent[]): SportsDBEvent[] {
  const seen = new Set<string>();
  const out: SportsDBEvent[] = [];
  for (const e of events) {
    const key = `${e.dateEvent}__${(e.strHomeTeam ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

function byTime(a: SportsDBEvent, b: SportsDBEvent): number {
  return (a.strTime ?? "").localeCompare(b.strTime ?? "");
}

export async function fetchEventsByDate(date: string): Promise<SportsDBEvent[]> {
  try {
    // Primary football source (server-proxied) + TheSportsDB for SA leagues.
    const [fd, sportsdbSoccer] = await Promise.all([
      fetchFootballDataOrg(date),
      fetchSport(date, "Soccer"),
    ]);
    const saSoccer = sportsdbSoccer
      .filter((e) => e && e.strLeague && SA_SOCCER_LEAGUES.has(e.strLeague))
      .map((e) => ({ ...e, strStatus: mapStatus(e.strStatus) }));

    const football = dedupe([...fd, ...saSoccer]).sort(byTime);
    if (football.length > 0) return football;

    // Only if there is zero football, fall back to NBA + MLB.
    const [basketball, baseball] = await Promise.all([
      fetchSport(date, "Basketball"),
      fetchSport(date, "Baseball"),
    ]);
    const nba = basketball
      .filter((e) => e && e.strLeague && NBA_LEAGUES.has(e.strLeague))
      .map((e) => ({ ...e, strStatus: mapStatus(e.strStatus) }));
    const mlb = baseball
      .filter((e) => e && e.strLeague && MLB_LEAGUES.has(e.strLeague))
      .map((e) => ({ ...e, strStatus: mapStatus(e.strStatus) }));
    return [...nba.sort(byTime), ...mlb.sort(byTime)];
  } catch {
    return [];
  }
}

export async function fetchEventById(id: string): Promise<SportsDBEvent | null> {
  // football-data.org IDs are prefixed by our proxy — look them up by scanning
  // recent dates so a shared/deep link still resolves.
  if (id.startsWith("fd-")) {
    const today = new Date();
    for (let offset = -3; offset <= 7; offset++) {
      const d = new Date(today);
      d.setDate(d.getDate() + offset);
      const iso = d.toISOString().slice(0, 10);
      const list = await fetchFootballDataOrg(iso);
      const found = list.find((e) => e.idEvent === id);
      if (found) return found;
    }
    return null;
  }
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

// Deterministic plausible odds from event id. All values are guaranteed to be
// positive numbers >= 1.40; no math ever subtracts from these values.
export function generateOdds(id: string): { home: string; draw: string; away: string } {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) >>> 0;
  const home = 1.4 + ((h % 200) / 100); // 1.40 - 3.39
  const draw = 3.0 + (((h >>> 8) % 100) / 100); // 3.00 - 3.99
  const away = 1.8 + (((h >>> 16) % 200) / 100); // 1.80 - 3.79
  const clamp = (n: number) => Math.max(1.01, n).toFixed(2);
  return { home: clamp(home), draw: clamp(draw), away: clamp(away) };
}

// Deterministic confidence 30 - 92
export function generateConfidence(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 17 + id.charCodeAt(i)) >>> 0;
  return 30 + (h % 63);
}
