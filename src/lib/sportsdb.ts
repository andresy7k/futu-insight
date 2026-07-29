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
    const events = json.events ?? [];
    if (sport === "Soccer") {
      console.log("[DEBUG] TheSportsDB Soccer raw count:", events.length);
      console.log(
        "[DEBUG] TheSportsDB Soccer leagues found:",
        [...new Set(events.map((e) => e.strLeague))],
      );
    } else {
      console.log(`[DEBUG] TheSportsDB ${sport} raw count:`, events.length);
    }
    return events;
  } catch {
    return [];
  }
}

async function fetchFootballDataOrg(date: string): Promise<SportsDBEvent[]> {
  try {
    const res = await fetch(`/api/matches?date=${date}`);
    if (!res.ok) return [];
    const json = (await res.json()) as { events?: SportsDBEvent[] };
    const events = json.events ?? [];
    console.log("[DEBUG] football-data.org raw count:", events.length);
    console.log(
      "[DEBUG] football-data.org competitions found:",
      [...new Set(events.map((e) => e.strLeague))],
    );
    return events.map((e) => ({ ...e, strStatus: mapStatus(e.strStatus) }));
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
    console.log("[DEBUG] TheSportsDB Soccer after filter:", saSoccer.length);
    console.log("[DEBUG] football-data.org after filter:", fd.length);

    const football = dedupe([...fd, ...saSoccer]).sort(byTime);
    if (football.length > 0) {
      console.log("[DEBUG] Final matches count:", football.length);
      console.log(
        "[DEBUG] Final matches by league:",
        football.reduce<Record<string, number>>((acc, m) => {
          acc[m.strLeague] = (acc[m.strLeague] || 0) + 1;
          return acc;
        }, {}),
      );
      if (football[0]) {
        const o = generateOdds(football[0].idEvent);
        console.log("[DEBUG] Odds raw values (first match):", {
          home: o.home,
          draw: o.draw,
          away: o.away,
        });
      }
      return football;
    }

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
    const fallback = [...nba.sort(byTime), ...mlb.sort(byTime)];
    console.log("[DEBUG] No football — fallback matches count:", fallback.length);
    console.log(
      "[DEBUG] Fallback matches by league:",
      fallback.reduce<Record<string, number>>((acc, m) => {
        acc[m.strLeague] = (acc[m.strLeague] || 0) + 1;
        return acc;
      }, {}),
    );
    if (fallback[0]) {
      const o = generateOdds(fallback[0].idEvent);
      console.log("[DEBUG] Odds raw values (first match):", o);
    }
    return fallback;
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
