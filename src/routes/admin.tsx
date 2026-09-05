import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { GlassCard } from "@/components/GlassCard";
import { useSession } from "@/lib/useSession";
import { supabase } from "@/integrations/supabase/client";

const ADMIN_EMAIL = "andrescalix00@gmail.com";
type Market = { market: string; type: string; selection: string; line: string; odds: string };
const starter: Market[] = [
  { market: "1X2", type: "1x2", selection: "home", line: "", odds: "" },
  { market: "1X2", type: "1x2", selection: "draw", line: "", odds: "" },
  { market: "1X2", type: "1x2", selection: "away", line: "", odds: "" },
];

export const Route = createFileRoute("/admin")({ component: AdminPage });

function AdminPage() {
  const { user, loading } = useSession();
  const [matchId, setMatchId] = useState(""); const [home, setHome] = useState(""); const [away, setAway] = useState(""); const [league, setLeague] = useState("ES"); const [note, setNote] = useState("");
  const [markets, setMarkets] = useState<Market[]>(starter); const [saving, setSaving] = useState(false);
  if (!loading && user?.email !== ADMIN_EMAIL) return <Navigate to="/" />;
  if (loading) return null;
  const update = (index: number, key: keyof Market, value: string) => setMarkets((items) => items.map((item, i) => i === index ? { ...item, [key]: value } : item));
  const save = async () => {
    const parsed = markets.filter((m) => m.market && m.type && m.selection && Number(m.odds) > 1).map((m) => ({ market: m.market, type: m.type, selection: m.selection, line: m.line === "" ? null : Number(m.line), odds: Number(m.odds), source: "Manual admin" }));
    if (!matchId || !home || !away || !league || !parsed.length) return toast.error("Completa partido y al menos una cuota decimal válida.");
    setSaving(true);
    const { error } = await supabase.from("manual_match_inputs").upsert({ match_id: matchId, home_team: home, away_team: away, league, markets: parsed, note: note || null, updated_by: user!.id, updated_at: new Date().toISOString() }, { onConflict: "match_id" });
    setSaving(false);
    error ? toast.error(error.message) : toast.success("Cuotas manuales guardadas: el próximo análisis las usará.");
  };
  return <main className="max-w-6xl mx-auto px-6 pt-12 pb-24">
    <div className="flex items-start gap-4"><div className="p-3 rounded-2xl bg-[#007AFF]/10 text-[#007AFF]"><ShieldCheck /></div><div><p className="text-[10px] uppercase tracking-widest text-[#007AFF] font-semibold">Administración</p><h1 className="text-3xl font-bold tracking-tight">Control de cuotas y notas</h1><p className="mt-2 text-sm text-[#636366]">Respaldo manual cuando Betano y las APIs no tengan datos.</p></div></div>
    <GlassCard className="mt-8 p-6"><div className="grid md:grid-cols-2 gap-4">
      {[["ID del partido", matchId, setMatchId], ["Equipo local", home, setHome], ["Equipo visitante", away, setAway], ["Liga (ES, E0, I1, F1, D1, BR, ARG)", league, setLeague]].map(([label, value, setter]) => <label key={label as string} className="text-xs font-medium text-[#636366]">{label as string}<input value={value as string} onChange={(e) => (setter as (v:string)=>void)(e.target.value)} className="mt-2 w-full rounded-xl border border-white/80 bg-white/60 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#007AFF]/30" /></label>)}
    </div><label className="mt-5 block text-xs font-medium text-[#636366]">Nota privada del administrador<textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Lesiones, información táctica o razón de la intervención…" className="mt-2 min-h-24 w-full rounded-xl border border-white/80 bg-white/60 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#007AFF]/30" /></label></GlassCard>
    <GlassCard className="mt-6 p-6"><div className="flex justify-between items-center"><div><h2 className="font-semibold">Cuotas manuales</h2><p className="mt-1 text-xs text-[#636366]">Decimal. Usa `1x2`, `totals`, `btts` o `handicap` como tipo.</p></div><button onClick={() => setMarkets((items) => [...items, { market: "Total Goals", type: "totals", selection: "over", line: "2.5", odds: "" }])} className="inline-flex items-center gap-1 rounded-full bg-black/5 px-3 py-2 text-xs font-medium hover:bg-black/10"><Plus className="w-3.5 h-3.5"/>Añadir mercado</button></div>
      <div className="mt-5 space-y-2">{markets.map((market, i) => <div key={i} className="grid grid-cols-[1.3fr_1fr_1fr_.7fr_.7fr_auto] gap-2"><input aria-label="Mercado" value={market.market} onChange={(e) => update(i,"market",e.target.value)} className="input"/><input aria-label="Tipo" value={market.type} onChange={(e) => update(i,"type",e.target.value)} className="input"/><input aria-label="Selección" value={market.selection} onChange={(e) => update(i,"selection",e.target.value)} className="input"/><input aria-label="Línea" value={market.line} onChange={(e) => update(i,"line",e.target.value)} className="input"/><input aria-label="Cuota" value={market.odds} onChange={(e) => update(i,"odds",e.target.value)} className="input"/><button onClick={() => setMarkets((items) => items.filter((_, n) => n !== i))} className="p-2 text-[#FF3B30]"><Trash2 className="w-4 h-4"/></button></div>)}</div>
      <button onClick={save} disabled={saving} className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#007AFF] px-5 py-2.5 text-sm font-medium text-white shadow-[0_4px_12px_rgba(0,122,255,.3)] disabled:opacity-50"><Save className="w-4 h-4"/>{saving ? "Guardando…" : "Guardar y usar en análisis"}</button>
    </GlassCard></main>;
}
