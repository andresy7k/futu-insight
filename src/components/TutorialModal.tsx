import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

export function TutorialModal({
  storageKey,
  title,
  steps,
}: {
  storageKey: string;
  title: string;
  steps: string[];
}) {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (!localStorage.getItem(storageKey)) setOpen(true);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  const dismiss = () => {
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/10 backdrop-blur-sm px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            className="w-full max-w-sm bg-white/70 backdrop-blur-3xl border border-white/80 rounded-3xl p-8 shadow-[0_24px_80px_rgba(0,0,0,0.12)]"
          >
            <h2 className="text-lg font-semibold tracking-tight text-[#1D1D1F]">{title}</h2>
            <p className="mt-3 text-sm text-[#636366] min-h-[64px]">{steps[i]}</p>
            <div className="mt-6 flex items-center justify-center gap-1.5">
              {steps.map((_, idx) => (
                <span
                  key={idx}
                  className={`h-1.5 rounded-full transition-all ${
                    idx === i ? "w-6 bg-[#007AFF]" : "w-1.5 bg-[#D1D1D6]"
                  }`}
                />
              ))}
            </div>
            <div className="mt-6 flex gap-2 justify-between">
              {i > 0 ? (
                <button
                  onClick={() => setI(i - 1)}
                  className="flex-1 h-10 rounded-full border border-[#007AFF]/30 text-[#007AFF] text-sm font-medium hover:bg-[#007AFF]/5 active:scale-95 transition"
                >
                  Anterior
                </button>
              ) : (
                <div className="flex-1" />
              )}
              {i < steps.length - 1 ? (
                <button
                  onClick={() => setI(i + 1)}
                  className="flex-1 h-10 rounded-full bg-[#007AFF] text-white text-sm font-medium hover:bg-[#0071e3] active:scale-95 transition"
                >
                  Siguiente
                </button>
              ) : (
                <button
                  onClick={dismiss}
                  className="flex-1 h-10 rounded-full bg-[#007AFF] text-white text-sm font-medium hover:bg-[#0071e3] active:scale-95 transition"
                >
                  Empezar
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}