import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { SportsDBEvent } from "@/lib/sportsdb";
import { fetchAnalysis } from "@/lib/analysis";

export function QuickSummaryModal({
  open,
  onClose,
  event,
}: {
  open: boolean;
  onClose: () => void;
  event: SportsDBEvent;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["analysis", event.idEvent, "quick"],
    queryFn: () => fetchAnalysis(event, "quick"),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const unavailable = !isLoading && (isError || !data || data.error);
  const riskLabel =
    data?.risk_level === "low"
      ? "bajo"
      : data?.risk_level === "high"
      ? "alto"
      : data?.risk_level === "medium"
      ? "medio"
      : null;
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-end md:items-center justify-center bg-black/10 backdrop-blur-sm px-4 pb-4 md:pb-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-lg bg-white/70 backdrop-blur-3xl border border-white/80 rounded-3xl p-6 shadow-[0_24px_80px_rgba(0,0,0,0.12)]"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-[#636366] hover:bg-black/5 transition"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="text-[10px] uppercase tracking-widest text-[#636366] font-semibold">
              Análisis rápido · IA
            </div>
            <h3 className="mt-2 text-lg font-semibold tracking-tight text-[#1D1D1F]">
              {event.strHomeTeam} vs {event.strAwayTeam}
            </h3>
            {isLoading && (
              <div className="mt-4 space-y-3">
                <div className="h-4 w-2/3 bg-black/5 rounded animate-pulse" />
                <div className="h-4 w-1/2 bg-black/5 rounded animate-pulse" />
                <div className="h-16 w-full bg-black/5 rounded animate-pulse" />
              </div>
            )}
            {!isLoading && unavailable && (
              <p className="mt-4 text-sm text-[#636366]">
                Análisis no disponible en este momento.
              </p>
            )}
            {!isLoading && !unavailable && data && (
              <div className="mt-4 space-y-3 text-sm text-[#1D1D1F]">
                {data.main_pick && (
                  <p>
                    <span className="font-medium">Pick principal:</span> {data.main_pick}
                  </p>
                )}
                {typeof data.confidence_score === "number" && (
                  <p>
                    <span className="font-medium">Confianza:</span>{" "}
                    {Math.round(data.confidence_score)}%
                  </p>
                )}
                {riskLabel && (
                  <p>
                    <span className="font-medium">Riesgo:</span> {riskLabel}
                  </p>
                )}
                {data.quick_summary && (
                  <p className="text-[#636366] leading-relaxed">{data.quick_summary}</p>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}