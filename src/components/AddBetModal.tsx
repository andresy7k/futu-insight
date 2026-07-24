import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { SportsDBEvent } from "@/lib/sportsdb";
import { useSession } from "@/lib/useSession";

export function AddBetModal({
  open,
  onClose,
  event,
  odds,
}: {
  open: boolean;
  onClose: () => void;
  event: SportsDBEvent;
  odds: { home: string; draw: string; away: string };
}) {
  const { user } = useSession();
  const [market, setMarket] = useState("1X2 · Local");
  const [stake, setStake] = useState("10");
  const [oddsVal, setOddsVal] = useState(odds.home);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const iso = event.dateEvent && event.strTime
      ? new Date(`${event.dateEvent}T${event.strTime}`).toISOString()
      : event.dateEvent
      ? new Date(event.dateEvent).toISOString()
      : null;
    const { error } = await supabase.from("bets").insert({
      user_id: user.id,
      match_id: event.idEvent,
      home_team: event.strHomeTeam,
      away_team: event.strAwayTeam,
      competition: event.strLeague,
      match_date: iso,
      market,
      stake: Number(stake) || 0,
      odds: Number(oddsVal) || 0,
      status: "pending",
    });
    setSaving(false);
    if (error) {
      toast.error("No se pudo guardar la apuesta");
      return;
    }
    toast.success("Apuesta añadida a tu portfolio");
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/10 backdrop-blur-sm px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            className="relative w-full max-w-md bg-white/70 backdrop-blur-3xl border border-white/80 rounded-3xl p-6 shadow-[0_24px_80px_rgba(0,0,0,0.12)]"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-[#636366] hover:bg-black/5 transition"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-lg font-semibold tracking-tight text-[#1D1D1F]">
              Añadir apuesta
            </h3>
            <p className="text-xs text-[#636366] mt-1">
              {event.strHomeTeam} vs {event.strAwayTeam}
            </p>
            <div className="mt-5 space-y-3">
              <Field label="Mercado">
                <select
                  value={market}
                  onChange={(e) => setMarket(e.target.value)}
                  className="w-full h-11 rounded-2xl bg-white/60 border border-white/80 px-4 text-sm text-[#1D1D1F] outline-none focus:border-[#007AFF]"
                >
                  <option>1X2 · Local</option>
                  <option>1X2 · Empate</option>
                  <option>1X2 · Visitante</option>
                  <option>Over 2.5</option>
                  <option>Under 2.5</option>
                  <option>BTTS</option>
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Stake (€)">
                  <input
                    type="number"
                    value={stake}
                    onChange={(e) => setStake(e.target.value)}
                    className="w-full h-11 rounded-2xl bg-white/60 border border-white/80 px-4 text-sm outline-none focus:border-[#007AFF]"
                  />
                </Field>
                <Field label="Cuota">
                  <input
                    type="number"
                    step="0.01"
                    value={oddsVal}
                    onChange={(e) => setOddsVal(e.target.value)}
                    className="w-full h-11 rounded-2xl bg-white/60 border border-white/80 px-4 text-sm outline-none focus:border-[#007AFF]"
                  />
                </Field>
              </div>
            </div>
            <button
              onClick={save}
              disabled={saving}
              className="mt-6 w-full h-11 rounded-full bg-[#007AFF] text-white text-sm font-medium hover:bg-[#0071e3] active:scale-95 transition shadow-[0_4px_16px_rgba(0,122,255,0.35)] disabled:opacity-60"
            >
              {saving ? "Guardando…" : "Guardar apuesta"}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-[#636366] font-medium">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}