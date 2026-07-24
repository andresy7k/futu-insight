import { motion } from "framer-motion";

export function ConfidenceBar({ score }: { score: number }) {
  const color = score > 70 ? "#34C759" : score >= 40 ? "#FF9F0A" : "#FF3B30";
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-[#636366] font-medium tracking-tight">Confianza IA</span>
        <span className="text-xs font-semibold text-[#1D1D1F]">{score}%</span>
      </div>
      <div className="w-full h-1.5 bg-black/5 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 1.1, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
    </div>
  );
}