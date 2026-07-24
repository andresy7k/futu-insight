import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useState } from "react";
import { MatchCard } from "@/components/MatchCard";
import { SkeletonCard } from "@/components/SkeletonCard";
import { TutorialModal } from "@/components/TutorialModal";
import { GlassCard } from "@/components/GlassCard";
import { fetchEventsByDate } from "@/lib/sportsdb";
import { formatMatchDate, getDateRange, toISODate } from "@/lib/dateUtils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Futibet · Inteligencia deportiva y análisis con IA" },
      {
        name: "description",
        content:
          "Análisis matemático y predicciones impulsadas por IA para las principales ligas de fútbol, NBA y MLB.",
      },
      { property: "og:title", content: "Futibet · Inteligencia deportiva" },
      {
        property: "og:description",
        content: "Predicciones y análisis de valor para los partidos del día.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const dates = getDateRange();
  const [selected, setSelected] = useState(toISODate(new Date()));

  const { data: events, isLoading } = useQuery({
    queryKey: ["events", selected],
    queryFn: () => fetchEventsByDate(selected),
    staleTime: 60_000,
  });

  return (
    <main className="max-w-7xl mx-auto px-6 pt-16 pb-24">
      {/* Hero */}
      <section className="text-center max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <motion.div
            animate={{ opacity: [0.85, 1, 0.85] }}
            transition={{ repeat: Infinity, duration: 3 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/60 backdrop-blur-2xl border border-white/70 text-xs font-medium text-[#1D1D1F] shadow-[0_4px_16px_rgba(0,0,0,0.04)]"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#34C759]" />
            🤖 IA activa · Análisis disponibles
          </motion.div>
          <h1 className="mt-6 text-5xl md:text-7xl font-bold tracking-tighter bg-gradient-to-br from-[#1D1D1F] to-[#636366] bg-clip-text text-transparent leading-[1.05]">
            Inteligencia Deportiva Superior.
          </h1>
          <p className="mt-5 text-lg md:text-xl text-[#636366] tracking-tight">
            Análisis matemático y predicciones impulsadas por IA.
          </p>
        </motion.div>
      </section>

      {/* Date ribbon */}
      <section className="mt-14 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-2 min-w-max justify-center px-2">
          {dates.map((d) => {
            const active = d === selected;
            return (
              <button
                key={d}
                onClick={() => setSelected(d)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-300 active:scale-95 ${
                  active
                    ? "bg-[#007AFF] text-white shadow-[0_4px_12px_rgba(0,122,255,0.35)]"
                    : "bg-white/50 backdrop-blur-md border border-white/60 text-[#1D1D1F] hover:bg-white/70"
                }`}
              >
                {formatMatchDate(d)}
              </button>
            );
          })}
        </div>
      </section>

      {/* Grid */}
      <section className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading &&
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        {!isLoading &&
          events?.map((e) => <MatchCard key={e.idEvent} event={e} />)}
      </section>

      {!isLoading && (!events || events.length === 0) && (
        <div className="mt-10">
          <GlassCard className="p-10 text-center">
            <p className="text-[#636366]">No hay partidos disponibles para esta fecha.</p>
          </GlassCard>
        </div>
      )}

      <TutorialModal
        storageKey="futibet_tutorial_home"
        title="Bienvenido a Futibet 👋"
        steps={[
          "Selecciona una fecha en la cinta superior para ver los partidos del día.",
          "Usa ⚡ Rápido para un resumen de IA o 📄 Detallado para el análisis completo.",
          "Agrega apuestas a tu portfolio con ➕ Apuesta para hacer seguimiento de tus resultados.",
        ]}
      />
    </main>
  );
}