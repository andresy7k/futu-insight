import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Wallet, TrendingUp, Percent, Target } from "lucide-react";
import {
  Area,
  AreaChart,
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
import { formatMatchDate, toISODate } from "@/lib/dateUtils";

export const Route = createFileRoute("/portfolio")({
  head: () => ({
    meta: [
      { title: "Portfolio · Futibet" },
      { name: "description", content: "Sigue tu bankroll, ROI y todas tus apuestas registradas." },
      { property: "og:title", content: "Portfolio · Futibet" },
      { property: "og:description", content: "Sigue tu bankroll y tus apuestas." },
    ],
  }),
  component: PortfolioPage,
});

interface Bet {
  id: string;
  match_id: string;
  home_team: string | null;
  away_team: string | null;
  competition: string | null;
  market: string;
  stake: number;
  odds: number;
  profit_loss: number | null;
  status: string;
  created_at: string;
  match_date: string | null;
}

function PortfolioPage() {
  const { user, loading } = useSession();
  const authed = !!user;

  const { data: bets = [] } = useQuery({
    queryKey: ["bets", user?.id],
    queryFn: async (): Promise<Bet[]> => {
      if (!user) return [];
      const { data } = await supabase
        .from("bets")
        .select("*")
        .order("created_at", { ascending: false });
      return (data as Bet[]) ?? [];
    },
    enabled: authed,
  });

  const totalStake = bets.reduce((s, b) => s + Number(b.stake || 0), 0);
  const totalPL = bets.reduce((s, b) => s + Number(b.profit_loss || 0), 0);
  const bankroll = 1000 + totalPL;
  const settled = bets.filter((b) => b.status === "won" || b.status === "lost");
  const wins = settled.filter((b) => b.status === "won").length;
  const winRate = settled.length ? (wins / settled.length) * 100 : 0;
  const roi = totalStake ? (totalPL / totalStake) * 100 : 0;

  // Chart: cumulative PL by day
  const byDay = new Map<string, number>();
  [...bets]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .forEach((b) => {
      const d = toISODate(new Date(b.created_at));
      byDay.set(d, (byDay.get(d) ?? 0) + Number(b.profit_loss || 0));
    });
  let acc = 1000;
  const chart = Array.from(byDay.entries()).map(([d, v]) => {
    acc += v;
    return { date: d.slice(5), value: Math.round(acc) };
  });
  if (chart.length === 0) chart.push({ date: "Hoy", value: 1000 });

  // Group by day
  const grouped = new Map<string, Bet[]>();
  bets.forEach((b) => {
    const d = toISODate(new Date(b.created_at));
    if (!grouped.has(d)) grouped.set(d, []);
    grouped.get(d)!.push(b);
  });

  return (
    <main className={`max-w-6xl mx-auto px-6 pt-12 pb-24 ${!authed && !loading ? "pointer-events-none blur-md select-none" : ""}`}>
      <div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tighter text-[#1D1D1F]">
          Tu Portfolio
        </h1>
        <p className="mt-2 text-[#636366]">
          Bankroll, resultados y seguimiento de todas tus apuestas.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric icon={<Wallet className="w-4 h-4" />} label="Bankroll actual" value={`€${bankroll.toFixed(2)}`} />
        <Metric
          icon={<TrendingUp className="w-4 h-4" />}
          label="Beneficio total"
          value={`${totalPL >= 0 ? "+" : ""}€${totalPL.toFixed(2)}`}
          tone={totalPL >= 0 ? "up" : "down"}
        />
        <Metric icon={<Percent className="w-4 h-4" />} label="ROI" value={`${roi.toFixed(1)}%`} tone={roi >= 0 ? "up" : "down"} />
        <Metric icon={<Target className="w-4 h-4" />} label="Tasa de acierto" value={`${winRate.toFixed(0)}%`} />
      </div>

      <GlassCard className="mt-6 p-6">
        <div className="text-[10px] uppercase tracking-widest text-[#636366] font-semibold">
          Bankroll
        </div>
        <div className="mt-4 h-40">
          <ResponsiveContainer>
            <AreaChart data={chart}>
              <defs>
                <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#007AFF" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#007AFF" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#636366" }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip contentStyle={{ background: "rgba(255,255,255,0.9)", border: "1px solid rgba(255,255,255,0.8)", borderRadius: 12, backdropFilter: "blur(12px)" }} />
              <Area type="monotone" dataKey="value" stroke="#007AFF" strokeWidth={1.5} fill="url(#bg)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>

      <div className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-[#1D1D1F]">Historial de apuestas</h2>

        {bets.length === 0 ? (
          <GlassCard className="mt-4 p-10 text-center">
            <p className="text-[#636366]">Aún no tienes apuestas registradas</p>
            <Link
              to="/"
              className="mt-4 inline-flex items-center h-10 px-5 rounded-full bg-[#007AFF] text-white text-sm font-medium hover:bg-[#0071e3] transition"
            >
              Explorar partidos de hoy
            </Link>
          </GlassCard>
        ) : (
          <div className="mt-4 space-y-8">
            {Array.from(grouped.entries()).map(([day, list]) => {
              const net = list.reduce((s, b) => s + Number(b.profit_loss || 0), 0);
              return (
                <div key={day}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-semibold text-[#1D1D1F]">
                      {formatMatchDate(day)}
                    </div>
                    <div className="text-sm font-semibold text-[#007AFF]">
                      {net >= 0 ? "+" : ""}€{net.toFixed(2)}
                    </div>
                  </div>
                  <div className="space-y-3">
                    {list.map((b) => (
                      <BetRow key={b.id} bet={b} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!loading && !authed && <AuthGateModal />}
      {authed && (
        <TutorialModal
          storageKey="futibet_tutorial_portfolio"
          title="Tu Portfolio 📊"
          steps={[
            "Aquí verás el resumen de tu bankroll y el historial de todas tus apuestas.",
            "Las apuestas se agrupan por día. Puedes ver el resultado neto de cada jornada.",
            "Actualiza el estado de una apuesta directamente desde el historial.",
          ]}
        />
      )}
    </main>
  );
}

function Metric({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  const color = tone === "up" ? "text-[#248A3D]" : tone === "down" ? "text-[#C7261C]" : "text-[#1D1D1F]";
  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2 text-[#636366]">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className={`mt-3 text-2xl font-bold tracking-tight tabular-nums ${color}`}>{value}</div>
    </GlassCard>
  );
}

function BetRow({ bet }: { bet: Bet }) {
  const pl = Number(bet.profit_loss || 0);
  const plColor =
    bet.status === "pending"
      ? "text-[#636366]"
      : pl >= 0
      ? "text-[#248A3D]"
      : "text-[#C7261C]";
  const statusPill =
    bet.status === "won"
      ? "bg-[#34C759]/15 text-[#34C759] border border-[#34C759]/30"
      : bet.status === "lost"
      ? "bg-[#FF3B30]/15 text-[#FF3B30] border border-[#FF3B30]/30"
      : "bg-[#8E8E93]/15 text-[#636366] border border-[#8E8E93]/30";
  const statusLabel =
    bet.status === "won" ? "Ganada" : bet.status === "lost" ? "Perdida" : "Pendiente";

  return (
    <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.3 }}>
      <GlassCard className="p-4 md:p-5">
        <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-[#1D1D1F] tracking-tight truncate">
              {bet.home_team} vs {bet.away_team}
            </div>
            <div className="text-xs text-[#636366]">{bet.competition}</div>
          </div>
          <div className="flex items-center gap-6 text-sm tabular-nums">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[#636366]">Mercado</div>
              <div className="text-[#1D1D1F]">{bet.market}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[#636366]">Stake</div>
              <div className="text-[#1D1D1F]">€{Number(bet.stake).toFixed(2)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[#636366]">Cuota</div>
              <div className="text-[#1D1D1F]">{Number(bet.odds).toFixed(2)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[#636366]">P/L</div>
              <div className={`font-semibold ${plColor}`}>
                {pl >= 0 ? "+" : ""}€{pl.toFixed(2)}
              </div>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusPill}`}>
              {statusLabel}
            </span>
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
}