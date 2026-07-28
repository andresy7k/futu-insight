import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useState } from "react";
import { toast } from "sonner";
import { TeamLogo } from "./TeamLogo";
import { ConfidenceBar } from "./ConfidenceBar";
import { OddsPills } from "./OddsPills";
import { QuickSummaryModal } from "./QuickSummaryModal";
import { AddBetModal } from "./AddBetModal";
import type { SportsDBEvent } from "@/lib/sportsdb";
import { generateConfidence, generateOdds } from "@/lib/sportsdb";
import { formatMatchTime } from "@/lib/dateUtils";
import { useSession } from "@/lib/useSession";
import { useAuthUI } from "@/lib/authStore";

export function MatchCard({ event }: { event: SportsDBEvent }) {
  const [quickOpen, setQuickOpen] = useState(false);
  const [betOpen, setBetOpen] = useState(false);
  const { user } = useSession();
  const openLogin = useAuthUI((s) => s.openLogin);

  const odds = generateOdds(event.idEvent);
  const confidence = generateConfidence(event.idEvent);

  const onBet = () => {
    if (!user) {
      openLogin();
      toast("Inicia sesión para añadir apuestas al portfolio");
      return;
    }
    setBetOpen(true);
  };

  return (
    <>
      <motion.div
        whileHover={{ y: -8 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative bg-white/50 backdrop-blur-2xl border border-white/70 rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,0.06)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.10)] transition-shadow duration-500 cursor-pointer overflow-hidden"
      >
        <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />
        <div className="p-6 flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-[#636366] font-semibold">
              {event.strLeague}
            </span>
            <span className="text-xs text-[#636366] tabular-nums">
              {formatMatchTime(event.strTime)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
              <TeamLogo src={event.strHomeTeamBadge} name={event.strHomeTeam} size={48} />
              <span className="text-sm font-medium text-[#1D1D1F] text-center line-clamp-2">
                {event.strHomeTeam}
              </span>
            </div>
            <span className="text-xs text-[#636366] font-medium">VS</span>
            <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
              <TeamLogo src={event.strAwayTeamBadge} name={event.strAwayTeam} size={48} />
              <span className="text-sm font-medium text-[#1D1D1F] text-center line-clamp-2">
                {event.strAwayTeam}
              </span>
            </div>
          </div>

          <ConfidenceBar score={confidence} />

          <OddsPills home={odds.home} draw={odds.draw} away={odds.away} />

          <div className="flex items-center gap-2">
            <button
              onClick={() => setQuickOpen(true)}
              className="flex-1 bg-white/60 backdrop-blur-sm border border-white/80 text-[#1D1D1F] rounded-full px-3 py-2 text-xs font-medium transition-all duration-300 hover:bg-[#007AFF] hover:text-white hover:border-transparent active:scale-95"
            >
              ⚡ Rápido
            </button>
            <Link
              to="/match/$id"
              params={{ id: event.idEvent }}
              className="flex-1 text-center bg-white/60 backdrop-blur-sm border border-white/80 text-[#1D1D1F] rounded-full px-3 py-2 text-xs font-medium transition-all duration-300 hover:bg-[#5856D6] hover:text-white hover:border-transparent active:scale-95"
            >
              📄 Detallado
            </Link>
            <button
              onClick={onBet}
              className="flex-1 bg-white/60 backdrop-blur-sm border border-white/80 text-[#1D1D1F] rounded-full px-3 py-2 text-xs font-medium transition-all duration-300 hover:bg-[#34C759] hover:text-white hover:border-transparent active:scale-95"
            >
              ➕ Apuesta
            </button>
          </div>
        </div>
      </motion.div>

      <QuickSummaryModal
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        event={event}
      />
      <AddBetModal open={betOpen} onClose={() => setBetOpen(false)} event={event} odds={odds} />
    </>
  );
}