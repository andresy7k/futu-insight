import { motion } from "framer-motion";

export function SkeletonCard() {
  return (
    <div className="relative bg-white/30 backdrop-blur-xl border border-white/50 rounded-3xl h-[280px] overflow-hidden">
      <motion.div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)",
        }}
        initial={{ x: "-100%" }}
        animate={{ x: "100%" }}
        transition={{ repeat: Infinity, duration: 1.6, ease: "linear" }}
      />
    </div>
  );
}