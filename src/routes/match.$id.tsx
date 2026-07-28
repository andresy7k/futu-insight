import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { fetchEventById, generateConfidence, generateOdds } from "@/lib/sportsdb";
import { fetchAnalysis } from "@/lib/analysis";
import { formatMatchDate, formatMatchTime } from "@/lib/dateUtils";
import { GlassCard } from "@/components/GlassCard";
import { TeamLogo } from "@/components/TeamLogo";
import { ConfidenceBar } from "@/components/ConfidenceBar";
import { OddsPills } from "@/components/OddsPills";
import { AddBetModal } from "@/components/AddBetModal";
import { useSession } from "@/lib/useSession";
import { useAuthUI } from "@/lib/authStore";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/match/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Análisis del partido · Futibet` },
      {
        name: "description",
        content: `Predicción IA, análisis táctico y valor de mercado para el partido ${params.id}.`,
      },
      { property: "og:title", content: "Análisis del partido · Futibet" },
      { property: "og:description", content: "Análisis profundo del partido con IA." },
    ],
  }),
  errorComponent: () => (
    <div className="max-w-2xl mx-auto px-6 pt-16">
      <GlassCard className="p-10 text-center">
        <p className="text-[#636366]">Ocurrió un error cargando el partido.</p>
      </GlassCard>
    </div>
  ),
  notFoundComponent: () => (
    <div className="max-w-2xl mx-auto px-6 pt-16">
      <GlassCard className="p-10 text-center">
        <p className="text-[#636366]">Partido no encontrado.</p>
      </GlassCard>
    </div>
  ),
  component: MatchPage,
});

function MatchPage() {
  const { id } = Route.useParams();
  const { user } = useSession();
  const openLogin = useAuthUI((s) => s.openLogin);
  const [betOpen, setBetOpen] = useState(false);
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const { data: event, isLoading } = useQuery({
    queryKey: ["match", id],
    queryFn: () => fetchEventById(id),
    staleTime: 60_000,
  });

  const { data: analysis, isLoading: analysisLoading } = useQuery({
    queryKey: ["analysis", id, "deep"],
    queryFn: () => (event ? fetchAnalysis(event, "deep") : Promise.resolve(null)),
    enabled: !!event,
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <main className="max-w-4xl mx-auto px-6 pt-12 pb-24">
        <div className="h-96 bg-white/30 backdrop-blur-xl rounded-3xl animate-pulse" />
      </main>
    );
  }

  if (!event) {
    return (
      <main className="max-w-2xl mx-auto px-6 pt-16">
        <GlassCard className="p-10 text-center">
          <p className="text-[#636366]">Partido no encontrado.</p>
        </GlassCard>
      </main>
    );
  }

  const fallbackConfidence = generateConfidence(event.idEvent);
  const fallbackOdds = generateOdds(event.idEvent);
  const analysisUnavailable = !analysisLoading && (!analysis || !!analysis.error);
  const confidence =
    typeof analysis?.confidence_score === "number"
      ? Math.round(analysis.confidence_score)
      : fallbackConfidence;
  const odds = analysis?.odds
    ? {
        home: analysis.odds.home.toFixed(2),
        draw: analysis.odds.draw ? analysis.odds.draw.toFixed(2) : "—",
        away: analysis.odds.away.toFixed(2),
      }
    : fallbackOdds;
  const mainPick =
    analysis?.main_pick ||
    (fallbackConfidence > 55 ? event.strHomeTeam : event.strAwayTeam);
  const riskLabel =
    analysis?.risk_level === "low"
      ? "Bajo"
      : analysis?.risk_level === "high"
      ? "Alto"
      : analysis?.risk_level === "medium"
      ? "Medio"
      : confidence > 70
      ? "Bajo"
      : confidence >= 40
      ? "Medio"
      : "Alto";
  const ml = analysis?.ml_probabilities ?? null;
  const deep = analysis?.deep_analysis;
  const deepSections: Array<{ t: string; d: string }> = deep
    ? [
        { t: "Forma del equipo", d: deep.team_form ?? "—" },
        { t: "Análisis de mercado", d: deep.market_analysis ?? "—" },
        { t: "Oportunidades de valor", d: deep.value_opportunities ?? "—" },
        { t: "Recomendación final", d: deep.final_recommendation ?? "—" },
      ].filter((s) => s.d && s.d !== "—")
    : [];
  const statusLabel =
    event.strStatus === "live"
      ? "En vivo"
      : event.strStatus === "finished"
      ? "Finalizado"
      : "Programado";
  const statusColor =
    event.strStatus === "live"
      ? "text-[#34C759] bg-[#34C759]/15 border-[#34C759]/30"
      : event.strStatus === "finished"
      ? "text-[#636366] bg-[#8E8E93]/15 border-[#8E8E93]/30"
      : "text-[#007AFF] bg-[#007AFF]/15 border-[#007AFF]/30";

  const saveNote = async () => {
    if (!user || !note.trim()) return;
    setSavingNote(true);
    const { error } = await supabase.from("match_notes").insert({
      user_id: user.id,
      match_id: event.idEvent,
      note: note.trim(),
    });
    setSavingNote(false);
    if (error) toast.error("No se pudo guardar la nota");
    else {
      toast.success("Nota guardada");
      setNote("");
    }
  };

  return (
    <main className="max-w-4xl mx-auto px-6 pt-12 pb-32">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        {/* Header */}
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-widest text-[#636366] font-semibold">
            {event.strLeague}
          </div>
          <div className="mt-1 text-sm text-[#636366]">
            {formatMatchDate(event.dateEvent)} · {formatMatchTime(event.strTime)}
          </div>
          <div className="mt-6 flex items-center justify-center gap-8 md:gap-16">
            <div className="flex flex-col items-center gap-3">
              <TeamLogo src={event.strHomeTeamBadge} name={event.strHomeTeam} size={72} />
              <span className="font-semibold text-[#1D1D1F] tracking-tight">
                {event.strHomeTeam}
              </span>
            </div>
            <span className="text-xs text-[#636366] font-medium">VS</span>
            <div className="flex flex-col items-center gap-3">
              <TeamLogo src={event.strAwayTeamBadge} name={event.strAwayTeam} size={72} />
              <span className="font-semibold text-[#1D1D1F] tracking-tight">
                {event.strAwayTeam}
              </span>
            </div>
          </div>
          <div className={`mt-6 inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border ${statusColor}`}>
            {event.strStatus === "live" && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#34C759] animate-pulse" />
            )}
            {statusLabel}
          </div>
        </div>

        {/* Prediction */}
        <GlassCard className="mt-10 p-6">
          <div className="text-[10px] uppercase tracking-widest text-[#636366] font-semibold">
            Predicción IA
          </div>
          <div className="mt-4 flex flex-col md:flex-row md:items-center gap-6">
            <div className="flex-1">
              <div className="text-2xl font-semibold tracking-tight text-[#1D1D1F]">
                {mainPick} · Pick principal
              </div>
              <div className="mt-1 text-sm text-[#636366]">Riesgo: {riskLabel}</div>
              {analysisLoading && (
                <div className="mt-3 h-3 w-40 bg-black/5 rounded animate-pulse" />
              )}
            </div>
            <div className="md:w-64">
              <ConfidenceBar score={confidence} />
            </div>
          </div>
          <div className="mt-6">
            <OddsPills home={odds.home} draw={odds.draw} away={odds.away} />
          </div>
          {analysis?.quick_summary && (
            <p className="mt-6 text-sm text-[#636366] leading-relaxed">
              {analysis.quick_summary}
            </p>
          )}
        </GlassCard>

        {/* ML probabilities */}
        {ml && (
          <GlassCard className="mt-6 p-6">
            <div className="text-[10px] uppercase tracking-widest text-[#636366] font-semibold">
              Probabilidades del modelo ML
            </div>
            <div className="mt-4 space-y-3">
              {[
                { label: event.strHomeTeam, value: ml.home, color: "#007AFF" },
                { label: "Empate", value: ml.draw, color: "#8E8E93" },
                { label: event.strAwayTeam, value: ml.away, color: "#FF3B30" },
              ].map((row) => (
                <div key={row.label}>
                  <div className="flex justify-between text-xs text-[#1D1D1F] mb-1">
                    <span>{row.label}</span>
                    <span className="tabular-nums">{(row.value * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-2 bg-black/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${row.value * 100}%`, background: row.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        )}

        {/* Deep analysis */}
        <GlassCard className="mt-6 p-6">
          <div className="text-[10px] uppercase tracking-widest text-[#636366] font-semibold">
            Análisis profundo
          </div>
          {analysisLoading && (
            <div className="mt-6 grid md:grid-cols-2 gap-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="h-4 w-1/3 bg-black/5 rounded animate-pulse" />
                  <div className="h-16 w-full bg-black/5 rounded animate-pulse" />
                </div>
              ))}
            </div>
          )}
          {!analysisLoading && deepSections.length > 0 && (
            <div className="mt-6 grid md:grid-cols-2 gap-6">
              {deepSections.map((s) => (
                <div key={s.t}>
                  <h4 className="text-sm font-semibold tracking-tight text-[#1D1D1F]">
                    {s.t}
                  </h4>
                  <p className="mt-1 text-sm text-[#636366] leading-relaxed">{s.d}</p>
                </div>
              ))}
            </div>
          )}
          {!analysisLoading && deepSections.length === 0 && (
            <p className="mt-6 text-sm text-[#636366]">
              {analysisUnavailable
                ? "Análisis no disponible en este momento."
                : "Sin secciones adicionales."}
            </p>
          )}
        </GlassCard>

        {/* Best picks */}
        {analysis?.best_picks && analysis.best_picks.length > 0 && (
          <GlassCard className="mt-6 p-6">
            <div className="text-[10px] uppercase tracking-widest text-[#636366] font-semibold">
              Mejores picks
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[#636366] text-xs">
                    <th className="py-2 pr-4 font-medium">Mercado</th>
                    <th className="py-2 pr-4 font-medium">Pick</th>
                    <th className="py-2 pr-4 font-medium tabular-nums">Cuota</th>
                    <th className="py-2 pr-4 font-medium tabular-nums">EV</th>
                    <th className="py-2 font-medium">Razonamiento</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.best_picks.map((p, i) => (
                    <tr key={i} className="border-t border-white/60 align-top">
                      <td className="py-2 pr-4">{p.market ?? "—"}</td>
                      <td className="py-2 pr-4">{p.pick ?? "—"}</td>
                      <td className="py-2 pr-4 tabular-nums">
                        {typeof p.odds === "number" ? p.odds.toFixed(2) : "—"}
                      </td>
                      <td
                        className={`py-2 pr-4 tabular-nums ${
                          typeof p.ev === "number" && p.ev > 0
                            ? "text-[#34C759]"
                            : "text-[#636366]"
                        }`}
                      >
                        {typeof p.ev === "number" ? p.ev.toFixed(3) : "—"}
                      </td>
                      <td className="py-2 text-[#636366]">{p.reasoning ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        </GlassCard>
        )}

        {/* Notes */}
        <GlassCard className="mt-6 p-6">
          <div className="text-[10px] uppercase tracking-widest text-[#636366] font-semibold">
            Notas
          </div>
          {user ? (
            <>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Añade contexto... (ej: baja de jugador clave)"
                className="mt-4 w-full min-h-[100px] rounded-2xl bg-white/60 border border-white/80 p-4 text-sm outline-none focus:border-[#007AFF] resize-none"
              />
              <button
                onClick={saveNote}
                disabled={savingNote || !note.trim()}
                className="mt-3 h-10 px-5 rounded-full bg-[#1D1D1F] text-white text-sm font-medium hover:opacity-90 active:scale-95 transition disabled:opacity-40"
              >
                {savingNote ? "Guardando…" : "Guardar nota"}
              </button>
            </>
          ) : (
            <p className="mt-4 text-sm text-[#636366]">Inicia sesión para añadir notas</p>
          )}
        </GlassCard>
      </motion.div>

      {/* Sticky bottom */}
      <div className="fixed bottom-6 left-0 right-0 z-40 flex justify-center px-6 pointer-events-none">
        <button
          onClick={() => (user ? setBetOpen(true) : openLogin())}
          className="pointer-events-auto h-12 px-6 rounded-full bg-[#007AFF] text-white text-sm font-semibold hover:bg-[#0071e3] active:scale-95 transition shadow-[0_12px_40px_rgba(0,122,255,0.40)]"
        >
          ➕ Añadir al portfolio
        </button>
      </div>

      <AddBetModal open={betOpen} onClose={() => setBetOpen(false)} event={event} odds={odds} />
    </main>
  );
}

// silence unused imports warning
void useRouter;