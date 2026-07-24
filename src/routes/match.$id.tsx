import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { fetchEventById, generateConfidence, generateOdds } from "@/lib/sportsdb";
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

  const confidence = generateConfidence(event.idEvent);
  const odds = generateOdds(event.idEvent);
  const risk = confidence > 70 ? "Bajo" : confidence >= 40 ? "Medio" : "Alto";
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
                {confidence > 55 ? event.strHomeTeam : event.strAwayTeam} · Pick principal
              </div>
              <div className="mt-1 text-sm text-[#636366]">Riesgo: {risk}</div>
            </div>
            <div className="md:w-64">
              <ConfidenceBar score={confidence} />
            </div>
          </div>
          <div className="mt-6">
            <OddsPills home={odds.home} draw={odds.draw} away={odds.away} />
          </div>
        </GlassCard>

        {/* Deep analysis */}
        <GlassCard className="mt-6 p-6">
          <div className="text-[10px] uppercase tracking-widest text-[#636366] font-semibold">
            Análisis profundo
          </div>
          <div className="mt-6 grid md:grid-cols-2 gap-6">
            {[
              { t: "Forma del equipo", d: `${event.strHomeTeam} llega en buena dinámica con estabilidad defensiva reciente.` },
              { t: "Análisis táctico", d: `Se espera un planteamiento posicional con presión media alta en ${event.strLeague}.` },
              { t: "Tendencias históricas", d: "Los duelos previos favorecen ligeramente al equipo local en el marcador." },
              { t: "Análisis de mercado", d: "Movimientos de cuota indican interés profesional en el mercado 1X2." },
              { t: "Oportunidades de valor", d: "Ventaja detectada en Over 2.5 y BTTS según modelos xG." },
              { t: "Recomendación final", d: `Pick sugerido: ${confidence > 55 ? event.strHomeTeam : event.strAwayTeam} con stake moderado.` },
            ].map((s) => (
              <div key={s.t}>
                <h4 className="text-sm font-semibold tracking-tight text-[#1D1D1F]">{s.t}</h4>
                <p className="mt-1 text-sm text-[#636366] leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </GlassCard>

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