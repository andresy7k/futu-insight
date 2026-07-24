import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import type { SportsDBEvent } from "@/lib/sportsdb";

export function QuickSummaryModal({
  open,
  onClose,
  event,
  confidence,
}: {
  open: boolean;
  onClose: () => void;
  event: SportsDBEvent;
  confidence: number;
}) {
  const pick = confidence > 55 ? event.strHomeTeam : event.strAwayTeam;
  const risk = confidence > 70 ? "bajo" : confidence >= 40 ? "medio" : "alto";
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
            <div className="mt-4 space-y-3 text-sm text-[#1D1D1F]">
              <p>
                <span className="font-medium">Pick principal:</span> {pick}
              </p>
              <p>
                <span className="font-medium">Confianza:</span> {confidence}%
              </p>
              <p>
                <span className="font-medium">Riesgo:</span> {risk}
              </p>
              <p className="text-[#636366] leading-relaxed">
                El modelo evalúa forma reciente, xG proyectado y desempeño histórico en
                {" "}{event.strLeague}. Ventaja marginal detectada en el mercado 1X2.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}