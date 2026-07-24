import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { GlassCard } from "@/components/GlassCard";
import { AuthGateModal } from "@/components/AuthGateModal";
import { TutorialModal } from "@/components/TutorialModal";
import { useSession } from "@/lib/useSession";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics · Futibet" },
      { name: "description", content: "Analíticas personalizadas de tu ROI, ligas y mercados." },
      { property: "og:title", content: "Analytics · Futibet" },
      { property: "og:description", content: "Analíticas de rendimiento personalizadas." },
    ],
  }),
  component: AnalyticsPage,
});

interface Bet {
  id: string;
  competition: string | null;
  market: string;
  stake: number;
  profit_loss: number | null;
  status: string;
  created_at: string;
}

function AnalyticsPage() {
  const { user, loading } = useSession();
  const authed = !!user;

  const { data: bets = [] } = useQuery({
    queryKey: ["bets-analytics", user?.id],
    queryFn: async (): Promise<Bet[]> => {
      const { data } = await supabase.from("bets").select("*");
      return (data as Bet[]) ?? [];
    },
    enabled: authed,
  });

  // ROI over time (cumulative)
  const sorted = [...bets].sort((a, b) => a.created_at.localeCompare(b.created_at));
  let cs = 0;
  let cp = 0;
  const roiSeries = sorted.map((b, i) => {
    cs += Number(b.stake || 0);
    cp += Number(b.profit_loss || 0);
    return { i: i + 1, roi: cs ? (cp / cs) * 100 : 0 };
  });
  if (roiSeries.length === 0) roiSeries.push({ i: 0, roi: 0 });

  // Monthly PL
  const monthly = new Map<string, number>();
  sorted.forEach((b) => {
    const d = new Date(b.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthly.set(key, (monthly.get(key) ?? 0) + Number(b.profit_loss || 0));
  });
  const monthlyData = Array.from(monthly.entries()).map(([m, v]) => ({ month: m.slice(5), pl: Math.round(v) }));
  if (monthlyData.length === 0) monthlyData.push({ month: "—", pl: 0 });

  // Win rate over time (rolling)
  let w = 0;
  let s = 0;
  const winTrend = sorted
    .filter((b) => b.status === "won" || b.status === "lost")
    .map((b, i) => {
      if (b.status === "won") w++;
      s++;
      return { i: i + 1, rate: s ? (w / s) * 100 : 0 };
    });
  if (winTrend.length === 0) winTrend.push({ i: 0, rate: 0 });

  // By league
  const byLeague = new Map<string, { pl: number; stake: number }>();
  bets.forEach((b) => {
    const k = b.competition || "—";
    const cur = byLeague.get(k) ?? { pl: 0, stake: 0 };
    cur.pl += Number(b.profit_loss || 0);
    cur.stake += Number(b.stake || 0);
    byLeague.set(k, cur);
  });
  const byMarket = new Map<string, { pl: number; stake: number }>();
  bets.forEach((b) => {
    const cur = byMarket.get(b.market) ?? { pl: 0, stake: 0 };
    cur.pl += Number(b.profit_loss || 0);
    cur.stake += Number(b.stake || 0);
    byMarket.set(b.market, cur);
  });

  return (
    <main className={`max-w-6xl mx-auto px-6 pt-12 pb-24 ${!authed && !loading ? "pointer-events-none blur-md select-none" : ""}`}>
      <div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tighter text-[#1D1D1F]">
          Tus Analíticas
        </h1>
        <p className="mt-2 text-[#636366]">
          Rendimiento por liga, mercado y evolución en el tiempo.
        </p>
      </div>

      <div className="mt-8 grid md:grid-cols-2 gap-6">
        <GlassCard className="p-6">
          <div className="text-[10px] uppercase tracking-widest text-[#636366] font-semibold">
            Evolución del ROI
          </div>
          <div className="mt-4 h-56">
            <ResponsiveContainer>
              <LineChart data={roiSeries}>
                <CartesianGrid stroke="rgba(0,0,0,0.05)" vertical={false} />
                <XAxis dataKey="i" tick={{ fontSize: 11, fill: "#636366" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#636366" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "rgba(255,255,255,0.9)", border: "1px solid rgba(255,255,255,0.8)", borderRadius: 12 }} />
                <Line type="monotone" dataKey="roi" stroke="#007AFF" strokeWidth={1.8} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard className="p-6">
          <div className="text-[10px] uppercase tracking-widest text-[#636366] font-semibold">
            Rendimiento mensual
          </div>
          <div className="mt-4 h-56">
            <ResponsiveContainer>
              <BarChart data={monthlyData}>
                <CartesianGrid stroke="rgba(0,0,0,0.05)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#636366" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#636366" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "rgba(255,255,255,0.9)", border: "1px solid rgba(255,255,255,0.8)", borderRadius: 12 }} />
                <Bar dataKey="pl" fill="#007AFF" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard className="p-6 md:col-span-2">
          <div className="text-[10px] uppercase tracking-widest text-[#636366] font-semibold">
            Tasa de acierto
          </div>
          <div className="mt-4 h-48">
            <ResponsiveContainer>
              <LineChart data={winTrend}>
                <CartesianGrid stroke="rgba(0,0,0,0.05)" vertical={false} />
                <XAxis dataKey="i" tick={{ fontSize: 11, fill: "#636366" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#636366" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "rgba(255,255,255,0.9)", border: "1px solid rgba(255,255,255,0.8)", borderRadius: 12 }} />
                <Line type="monotone" dataKey="rate" stroke="#5856D6" strokeWidth={1.8} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-[#1D1D1F]">
          Rendimiento por liga
        </h2>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from(byLeague.entries()).map(([name, v]) => {
            const roi = v.stake ? (v.pl / v.stake) * 100 : 0;
            return (
              <GlassCard key={name} className="p-4">
                <div className="text-xs text-[#636366] truncate">{name}</div>
                <div className={`mt-2 text-lg font-semibold tabular-nums ${roi >= 0 ? "text-[#248A3D]" : "text-[#C7261C]"}`}>
                  {roi.toFixed(1)}%
                </div>
              </GlassCard>
            );
          })}
          {byLeague.size === 0 && (
            <GlassCard className="p-4 col-span-full text-center text-sm text-[#636366]">
              Sin datos aún
            </GlassCard>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight text-[#1D1D1F]">
          Rendimiento por mercado
        </h2>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from(byMarket.entries()).map(([name, v]) => {
            const roi = v.stake ? (v.pl / v.stake) * 100 : 0;
            return (
              <GlassCard key={name} className="p-4">
                <div className="text-xs text-[#636366] truncate">{name}</div>
                <div className={`mt-2 text-lg font-semibold tabular-nums ${roi >= 0 ? "text-[#248A3D]" : "text-[#C7261C]"}`}>
                  {roi.toFixed(1)}%
                </div>
              </GlassCard>
            );
          })}
          {byMarket.size === 0 && (
            <GlassCard className="p-4 col-span-full text-center text-sm text-[#636366]">
              Sin datos aún
            </GlassCard>
          )}
        </div>
      </section>

      {!loading && !authed && <AuthGateModal />}
      {authed && (
        <TutorialModal
          storageKey="futibet_tutorial_analytics"
          title="Tus Analíticas 📈"
          steps={[
            "Visualiza la evolución de tu ROI y tu rendimiento mes a mes.",
            "Descubre en qué ligas y mercados obtienes mejores resultados.",
            "Usa estos datos para mejorar tu estrategia de apuestas.",
          ]}
        />
      )}
    </main>
  );
}